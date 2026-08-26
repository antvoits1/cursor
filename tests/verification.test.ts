import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEmail } from '../server/emailVerifier.js';
import { extractContactsFromText, assistantAvailable, beginUsage } from '../server/assistant.js';

/*
 * Two rules are being protected here.
 *
 * A check that could not run must never be reported as a pass. An address
 * wrongly marked deliverable costs a sales team a bounce and a damaged sender
 * reputation; one marked unverifiable costs them nothing.
 *
 * And the assistant must never be able to introduce a value that was not on the
 * page. Everything it returns is checked back against the source text.
 */

test('a malformed address is rejected without any lookup', async () => {
  for (const bad of ['not-an-email', 'two@@at.com', 'trailing@dot.', '@nolocal.com', 'spaces in@name.com']) {
    const result = await verifyEmail(bad);
    assert.equal(result.syntaxValid, false, `${bad} should not pass syntax`);
    assert.equal(result.verdict, 'undeliverable');
    assert.equal(result.domainHasMx, null, 'a malformed address must not trigger a DNS lookup');
  }
});

test('a domain that does not exist is reported undeliverable, not unverifiable', async () => {
  const result = await verifyEmail('someone@this-domain-does-not-exist-9f8a7b6c5d.com');
  assert.equal(result.verdict, 'undeliverable');
  assert.ok(result.basis.some((line) => /does not resolve/i.test(line)));
});

test('a throwaway-mail domain is flagged risky even though it works', async () => {
  const result = await verifyEmail('someone@mailinator.com');
  assert.equal(result.disposable, true);
  assert.equal(result.verdict, 'risky', 'a working throwaway address is still not worth contacting');
});

test('a shared function mailbox is identified as a role account', async () => {
  const result = await verifyEmail('info@whitfieldlaw.net');
  assert.equal(result.roleAccount, true);

  const personal = await verifyEmail('dana.whitfield@whitfieldlaw.net');
  assert.equal(personal.roleAccount, false);
});

test('a check that could not run reports null rather than false', async () => {
  // The SMTP probe is off unless switched on, because port 25 is blocked on
  // nearly every cloud host. It must say so rather than fail the address.
  const result = await verifyEmail('dana.whitfield@gmail.com');
  assert.equal(result.smtpAccepted, null, 'an unrun mailbox check is null, never false');
  assert.notEqual(result.verdict, 'undeliverable', 'a check that did not run must not condemn an address');
  assert.ok(
    result.basis.some((line) => /port 25|switched off|not been run/i.test(line)),
    'the report must say why the mailbox itself was not checked',
  );
});

test('a real mail domain is recognised as able to receive mail', async () => {
  const result = await verifyEmail('someone@gmail.com');
  assert.equal(result.syntaxValid, true);
  assert.equal(result.domainHasMx, true);
  assert.ok(['probably_deliverable', 'unverifiable', 'deliverable'].includes(result.verdict));
});

test('every verdict comes with readable reasoning', async () => {
  const result = await verifyEmail('dana.whitfield@gmail.com');
  assert.ok(result.basis.length >= 2);
  for (const line of result.basis) assert.ok(line.length > 10, 'each reason is a sentence, not a code');
});

/* ------------------------------- assistant -------------------------------- */

test('the assistant layer is absent rather than broken when no key is set', async () => {
  if (assistantAvailable()) return; // A key is configured in this environment.

  const usage = beginUsage();
  assert.equal(usage.provider, 'none');
  assert.match(usage.unavailableReason ?? '', /GEMINI_API_KEY|XAI_API_KEY/);

  const result = await extractContactsFromText('Call us on (305) 555-0147.', usage);
  assert.equal(result, null, 'with no key the assistant must no-op, not throw');
  assert.equal(usage.callCount, 0);
});
