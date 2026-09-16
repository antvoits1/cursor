import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leads } from '../src/data/leads';
import { initialMailbox } from '../src/data/mail';
import type { SmsMessage } from '../src/data/types';
import { activityIcon, buildAllEvents, buildCallLog, buildThreads } from '../src/lib/comm';

const smsByLead: Record<string, SmsMessage[]> = Object.fromEntries(leads.map((l) => [l.id, l.sms]));

test('buildThreads only includes leads that have messages', () => {
  const threads = buildThreads(leads, smsByLead);
  const withSms = leads.filter((l) => l.sms.length > 0).length;
  assert.equal(threads.length, withSms);
  assert.ok(threads.every((t) => t.preview.length > 0 && t.time.length > 0));
});

test('buildThreads preview is the last message', () => {
  const threads = buildThreads(leads, smsByLead);
  const ns = threads.find((t) => t.leadId === 'ns');
  assert.equal(ns?.preview, leads[0].sms[leads[0].sms.length - 1].text);
});

test('buildAllEvents mixes messages, calls, and email', () => {
  const events = buildAllEvents(leads, smsByLead);
  const kinds = new Set(events.map((e) => e.kind));
  assert.ok(kinds.has('messages'));
  assert.ok(kinds.has('calls'));
  assert.ok(kinds.has('email'));
  assert.ok(events.length <= 18);
});

test('buildCallLog prepends session calls ahead of lead calls', () => {
  const session = [
    {
      id: 'session-1',
      leadId: 'ns',
      who: 'Elijah Lance',
      dir: 'out' as const,
      duration: '00:07',
      when: 'Just now',
      device: 'iPhone 16 Pro',
      number: '(720) 737-8464',
      note: '',
    },
  ];
  const log = buildCallLog(leads, session);
  assert.equal(log[0].id, 'session-1');
  assert.ok(log.length > 1);
  assert.ok(log.length <= 18);
});

test('activityIcon maps copy to icons', () => {
  assert.equal(activityIcon('Email sent · term sheet'), 'mail');
  assert.equal(activityIcon('Call · 8m 41s'), 'call');
  assert.equal(activityIcon('SMS · loss-runs'), 'sms');
  assert.equal(activityIcon('Funded $125,000'), 'activity');
});

test('mailbox seeds inbox, sent, and drafts folders', () => {
  const folders = new Set(initialMailbox.map((m) => m.folder));
  assert.ok(folders.has('inbox'));
  assert.ok(folders.has('sent'));
  assert.ok(folders.has('drafts'));
  assert.ok(initialMailbox.some((m) => m.unread));
});
