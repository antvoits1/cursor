export interface Phone {
  l: string;
  n: string;
}

export interface Bank {
  name: string;
  acct: string;
  routing: string;
  type: string;
  adb: number;
  bal: number;
}

export interface Statement {
  m: string;
  dep: number;
  end: number;
  bal?: number;
}

export interface MCA {
  who: string;
  funded: number;
  factor: number;
  daily: number;
  rem: number;
  pos: string;
  started: string;
  cad: string;
}

export type ExpenseEntry = [label: string, amount: number, cadence: string, note?: string];

export interface FileDoc {
  n: string;
  t: string;
  p: string;
}

export interface Note {
  who: string;
  when: string;
  txt: string;
}

export interface SmsEntry {
  dir: 'in' | 'out';
  ch?: 'wa' | 'sms';
  n?: string;
  t: string;
  txt: string;
}

export interface MailEntry {
  sub: string;
  from: string;
  to: string;
  when: string;
  preview: string;
}

export interface CallEntry {
  who: string;
  dir: 'in' | 'out';
  dur: string;
  when: string;
  dev: string;
  n: string;
  note: string;
}

export interface ActivityEntry {
  when: string;
  what: string;
}

export interface Lead {
  id: string;
  company: string;
  dba: string;
  contact: string;
  title: string;
  industry: string;
  city: string;
  avg: number;
  ask: number;
  offer: number | null;
  pos: string;
  rep: string;
  source: string;
  employees: number;
  started: string;
  tib: string;
  entity: string;
  ein: string;
  ssn: string;
  dob: string;
  address: string;
  statementAddress: string;
  website: string;
  lastAgo: string;
  mobiles: Phone[];
  landlines: Phone[];
  emails: Phone[];
  months: number[];
  monthLabs: string[];
  nsf: number[];
  bank: Bank;
  stmts: Statement[];
  mtd: Statement | null;
  mca: MCA[];
  expenses: ExpenseEntry[];
  files: FileDoc[];
  notes: Note[];
  sms: SmsEntry[];
  mails: MailEntry[];
  calls: CallEntry[];
  activity: ActivityEntry[];
  use: string;
  fav: boolean;
  follow: string | null;
  tracked?: boolean;
}

export const INITIAL_LEADS: Lead[] = [
  {id:"ns", company:"Northstar Catering Co.", dba:"Northstar", contact:"Elena Voss", title:"Owner / CEO", industry:"Catering · 2 units", city:"Manhattan, NY",
    avg:250000, ask:150000, offer:125000, pos:"2nd", rep:"Cole Brennan", source:"ISO · Harbor Point FG-NS-1844", employees:34, started:"March 2019", tib:"7 years 6 months",
    entity:"New York S-Corporation", ein:"11-2234419", ssn:"078-05-1120", dob:"March 14, 1984",
    address:"412 W 37th St, New York, NY 10018", statementAddress:"88 Gold St, Long Island City, NY 11101", website:"northstarcatering.com",
    lastAgo:"30m ago",
    mobiles:[{l:"Mobile",n:"(917) 555-0142"},{l:"Mobile 2",n:"(917) 555-8831"},{l:"WhatsApp",n:"(347) 555-0142"}],
    landlines:[{l:"Office",n:"(212) 555-0188"},{l:"Kitchen",n:"(212) 555-0160"}],
    emails:[{l:"Work",n:"elena@northstarcatering.com"},{l:"Ops",n:"ops@northstarcatering.com"},{l:"Personal",n:"elena.voss@gmail.com"}],
    months:[218,226,241,233,248,261,244,252,238,249,258,250],
    monthLabs:["S","O","N","D","J","F","M","A","M","J","J","A"],
    nsf:[0,0,1,0,0,0,1,0,2,1,1,0],
    bank:{name:"Chase Business Complete", acct:"4482014419", routing:"021000021", type:"Checking", adb:28400, bal:41220},
    stmts:[{m:"August 2026", dep:250000, end:41220},{m:"July 2026", dep:258000, end:38640},{m:"June 2026", dep:249000, end:35480}],
    mtd:{m:"September 2026", dep:41800, bal:41220, end:41220},
    mca:[{who:"RapidCap", funded:85000, factor:1.38, daily:612, rem:41200, pos:"1st", started:"May 2026", cad:"Daily ACH"}],
    expenses:[["COGS / food",62000,"monthly","Largest cash-flow pressure — food vendors draft 3–4x a week and leave little slack after RapidCap."],["Payroll",48000,"biweekly"],["Rent (2 sites)",14200,"monthly"],["RapidCap ACH",13464,"daily"]],
    files:[{n:"Application",t:"PDF",p:"4p"},{n:"August statement",t:"PDF",p:"8p"},{n:"July statement",t:"PDF",p:"8p"},{n:"June statement",t:"PDF",p:"7p"},{n:"MTD",t:"PDF",p:"2p"}],
    notes:[{who:"Cole Brennan",when:"Today 6:14 AM",txt:"Elena walked the LIC buildout on FaceTime. Hood and fire-suppression already in. Wants funds before Oct 1 so she can order equipment without stacking a third advance."}],
    sms:[
      {dir:"in",ch:"wa",n:"(347) 555-0142",t:"Thu 7:21 PM",txt:"Cole — Priya uploaded August last night. The $880 NSF was a Sysco double-draft, reversed same day. ✅"},
      {dir:"out",ch:"wa",n:"(347) 555-0142",t:"Thu 7:36 PM",txt:"Got it. Numbers look clean. I’ll have a term sheet tomorrow."},
      {dir:"in",ch:"sms",n:"(917) 555-0142",t:"Yesterday 5:02 PM",txt:"Any word? Landlord wants the remaining deposit Monday 😬"},
      {dir:"out",ch:"sms",n:"(917) 555-0142",t:"Yesterday 5:11 PM",txt:"Term sheet is in your inbox. $125k second position. Call you at 2 tomorrow to walk it."},
      {dir:"in",ch:"sms",n:"(917) 555-8831",t:"Tue 11:02 AM",txt:"This is Elena’s other line — use 0142 for daytime."}
    ],
    mails:[
      {sub:"Northstar Catering — $125k second position term sheet",from:"Cole Brennan",to:"elena@northstarcatering.com",when:"Yesterday 5:09 PM",preview:"Elena — attached is the term sheet we discussed. $125,000, factor 1.32, 10 months, ACH $548/day. RapidCap stays first."},
      {sub:"Stips outstanding · 2025 return",from:"Maya Chen",to:"elena@northstarcatering.com",when:"Wed 4:12 PM",preview:"Need the 2025 1120-S to lock the file. Everything else is in."}
    ],
    calls:[
      {who:"Elena Voss",dir:"out",dur:"12:04",when:"Yesterday 2:16 PM",dev:"Poly Edge E450",n:"(917) 555-0142",note:"Walked term sheet. She’s comparing a 1.41 first-position offer from SwiftFund."},
      {who:"Elena Voss",dir:"in",dur:"03:22",when:"Thu 9:41 AM",dev:"iPhone 16 Pro",n:"(917) 555-0142",note:"Asked if we can fund next week."}
    ],
    activity:[
      {when:"30m ago",what:"SMS to Elena Voss · term sheet follow-up"},
      {when:"Yesterday 5:09 PM",what:"Email sent · $125k term sheet"},
      {when:"Yesterday 2:16 PM",what:"Call · Elena Voss · 12m 04s · Poly desk"}
    ],
    use:"LIC kitchen equipment + opening float", fav:true, follow:"2026-09-05", tracked:true
  },
  {id:"hl", company:"Harborline Logistics", dba:"Harborline", contact:"Marcus Chen", title:"President", industry:"Trucking · 18 cabs", city:"Newark, NJ",
    avg:300000, ask:200000, offer:175000, pos:"1st", rep:"Cole Brennan", source:"Inbound web FG-HL-2091", employees:41, started:"June 2016", tib:"10 years 3 months",
    entity:"New Jersey LLC", ein:"22-1188821", ssn:"142-22-8831", dob:"August 2, 1979",
    address:"88 Doremus Ave, Newark, NJ 07105", statementAddress:"88 Doremus Ave, Newark, NJ 07105", website:"harborlinelog.com",
    lastAgo:"1h ago",
    mobiles:[{l:"Mobile",n:"(973) 555-0144"},{l:"Mobile 2",n:"(973) 555-2290"},{l:"WhatsApp",n:"(973) 555-0144"}],
    landlines:[{l:"Dispatch",n:"(973) 555-0170"},{l:"Office",n:"(973) 555-0171"}],
    emails:[{l:"Work",n:"marcus@harborlinelog.com"},{l:"Controller",n:"alba@harborlinelog.com"},{l:"Personal",n:"mchen.haul@gmail.com"}],
    months:[268,274,288,279,292,310,298,305,286,296,312,300],
    monthLabs:["S","O","N","D","J","F","M","A","M","J","J","A"],
    nsf:[0,1,0,0,0,0,0,1,0,0,0,0],
    bank:{name:"TD Bank Business", acct:"3319088821", routing:"031201360", type:"Checking", adb:41200, bal:66740},
    stmts:[{m:"August 2026", dep:300000, end:66740},{m:"July 2026", dep:312000, end:58110},{m:"June 2026", dep:296000, end:53760}],
    mtd:{m:"September 2026", dep:48200, bal:66740, end:66740},
    mca:[],
    expenses:[["Driver payroll",110000,"weekly","Largest pressure — payroll hits every Friday and fuel floats mid-week."],["Fuel",48000,"weekly"],["Insurance",19000,"monthly"],["Lease trucks",22000,"monthly"]],
    files:[{n:"Application",t:"PDF",p:"3p"},{n:"August statement",t:"PDF",p:"10p"},{n:"July statement",t:"PDF",p:"9p"},{n:"June statement",t:"PDF",p:"9p"},{n:"MTD",t:"PDF",p:"2p"}],
    notes:[{who:"Cole Brennan",when:"1h ago",txt:"Clean 1st position. Wants $200k for 4 additional daycabs. $175k is the box unless loss-runs land."}],
    sms:[{dir:"out",ch:"sms",t:"1h ago",txt:"Marcus — send the loss-runs and I can push $200k to credit."},{dir:"in",ch:"sms",t:"52m ago",txt:"Alba will email them Monday."}],
    mails:[{sub:"Harborline — file opening",from:"Cole Brennan",to:"marcus@harborlinelog.com",when:"Wed 9:14 AM",preview:"Opened a 1st-position file. Target $175–200k pending insurance."}],
    calls:[{who:"Marcus Chen",dir:"out",dur:"08:41",when:"1h ago",dev:"Poly Edge E450",n:"(973) 555-0144",note:"Discovery. Clean books. Fuel spike in Feb explained."}],
    activity:[{when:"1h ago",what:"Call · 8m 41s"},{when:"52m ago",what:"SMS · loss-runs"}],
    use:"Four additional daycabs", fav:false, follow:"2026-09-08"
  },
  {id:"bd", company:"Brightwell Dental Group", dba:"Brightwell", contact:"Dr. Priya Shah", title:"Managing Partner", industry:"Dental · 3 chairs", city:"White Plains, NY",
    avg:350000, ask:100000, offer:100000, pos:"1st", rep:"Cole Brennan", source:"Partner · MedISO FG-BD-4410", employees:11, started:"April 2014", tib:"12 years 5 months",
    entity:"New York PC", ein:"13-4422204", ssn:"091-44-2204", dob:"November 9, 1981",
    address:"14 Mamaroneck Ave, White Plains, NY 10601", statementAddress:"14 Mamaroneck Ave, White Plains, NY 10601", website:"brightwelldental.com",
    lastAgo:"3h ago",
    mobiles:[{l:"Mobile",n:"(914) 555-0120"},{l:"Mobile 2",n:"(914) 555-0121"},{l:"WhatsApp",n:"(914) 555-0120"}],
    landlines:[{l:"Front desk",n:"(914) 555-0180"},{l:"Back office",n:"(914) 555-0181"}],
    emails:[{l:"Work",n:"p.shah@brightwelldental.com"},{l:"Office",n:"owen@brightwelldental.com"},{l:"Personal",n:"priya.shah.dds@gmail.com"}],
    months:[318,322,331,328,340,348,339,344,336,342,351,350],
    monthLabs:["S","O","N","D","J","F","M","A","M","J","J","A"],
    nsf:[0,0,0,0,0,0,0,0,0,0,0,0],
    bank:{name:"Wells Fargo Practice", acct:"2081142204", routing:"121000248", type:"Checking", adb:52300, bal:71800},
    stmts:[{m:"August 2026", dep:350000, end:71800},{m:"July 2026", dep:351000, end:64010},{m:"June 2026", dep:342000, end:59880}],
    mtd:{m:"September 2026", dep:51000, bal:71800, end:71800},
    mca:[],
    expenses:[["Clinical payroll",42000,"biweekly","Largest outflow — hygienists and associates, predictable and covered by ADB."],["Lab / supplies",18000,"monthly"],["Rent",9200,"monthly"]],
    files:[{n:"Application",t:"PDF",p:"3p"},{n:"August statement",t:"PDF",p:"6p"},{n:"July statement",t:"PDF",p:"6p"},{n:"June statement",t:"PDF",p:"6p"},{n:"MTD",t:"PDF",p:"1p"}],
    notes:[{who:"Maya Chen",when:"3h ago",txt:"Approved $100k / 1.25 / 8 mo. Contracts out."}],
    sms:[{dir:"out",ch:"sms",t:"3h ago",txt:"Priya — you’re approved at $100k. DocuSign is in your email."},{dir:"in",ch:"wa",t:"2h ago",txt:"Signed. When do we fund? 🦷"}],
    mails:[{sub:"Brightwell Dental — approval & contracts",from:"Cole Brennan",to:"p.shah@brightwelldental.com",when:"3h ago",preview:"Congratulations — $100,000 at 1.25, 8-month ACH. Docs attached."}],
    calls:[{who:"Priya Shah",dir:"out",dur:"04:11",when:"3h ago",dev:"iPhone 16 Pro",n:"(914) 555-0120",note:"Congrats call. Funding Monday if contracts complete."}],
    activity:[{when:"2h ago",what:"WhatsApp · contracts signed"},{when:"3h ago",what:"Approved $100k"}],
    use:"CBCT scanner", fav:true, follow:"2026-09-08", tracked:true
  },
  {id:"ro", company:"Red Oak Auto Body", dba:"Red Oak", contact:"Dominic Ruiz", title:"Owner", industry:"Collision repair", city:"Queens, NY",
    avg:400000, ask:75000, offer:null, pos:"1st", rep:"Avery Lang", source:"Cold · data FG-RO-7730", employees:9, started:"January 2011", tib:"15 years 8 months",
    entity:"New York LLC", ein:"11-8877730", ssn:"058-12-7730", dob:"May 22, 1976",
    address:"41-22 Northern Blvd, Long Island City, NY 11101", statementAddress:"41-22 Northern Blvd, Long Island City, NY 11101", website:"redoakbody.com",
    lastAgo:"1d ago",
    mobiles:[{l:"Mobile",n:"(718) 555-0133"},{l:"Mobile 2",n:"(917) 555-0133"},{l:"WhatsApp",n:"(718) 555-0133"}],
    landlines:[{l:"Shop",n:"(718) 555-0130"},{l:"Paint booth",n:"(718) 555-0131"}],
    emails:[{l:"Work",n:"dom@redoakbody.com"},{l:"Office",n:"shop@redoakbody.com"},{l:"Personal",n:"druiz.body@gmail.com"}],
    months:[362,371,384,378,392,405,388,398,374,390,408,400],
    monthLabs:["S","O","N","D","J","F","M","A","M","J","J","A"],
    nsf:[1,0,2,1,0,1,0,0,1,0,0,1],
    bank:{name:"Bank of America", acct:"9910047730", routing:"026009593", type:"Checking", adb:19400, bal:22120},
    stmts:[{m:"August 2026", dep:400000, end:22120},{m:"July 2026", dep:408000, end:18400},{m:"June 2026", dep:390000, end:20110}],
    mtd:{m:"September 2026", dep:22000, bal:22120, end:22120},
    mca:[{who:"FlashAdvance", funded:40000, factor:1.49, daily:380, rem:18400, pos:"1st", started:"Mar 2026", cad:"Daily ACH"}],
    expenses:[["Techs",32000,"weekly","Labor is the choke — FlashAdvance drafts daily on top of Friday payroll."],["Parts",21000,"weekly"],["Rent",7800,"monthly"],["FlashAdvance",8360,"daily"]],
    files:[{n:"Application",t:"PDF",p:"2p"},{n:"August statement",t:"PDF",p:"8p"},{n:"July statement",t:"PDF",p:"8p"},{n:"June statement",t:"PDF",p:"8p"},{n:"MTD",t:"PDF",p:"1p"}],
    notes:[{who:"Avery Lang",when:"1d ago",txt:"Price shopping. Existing FlashAdvance 1.49 is painful. Needs four months of statements."}],
    sms:[{dir:"out",ch:"sms",t:"1d ago",txt:"Dom — send Jun–Aug statements and I can see if we refinance Flash."}],
    mails:[],
    calls:[{who:"Dominic Ruiz",dir:"out",dur:"05:02",when:"1d ago",dev:"Poly Edge E450",n:"(718) 555-0133",note:"First conversation. Skeptical of stacking."}],
    activity:[{when:"1d ago",what:"Call · 5m"},{when:"1d ago",what:"SMS · statement request"}],
    use:"Frame machine", fav:false, follow:"2026-09-10"
  },
  {id:"lu", company:"Lumen & Co. Interiors", dba:"Lumen", contact:"Sable Whitaker", title:"Principal", industry:"Commercial interiors", city:"Brooklyn, NY",
    avg:450000, ask:90000, offer:null, pos:"1st", rep:"Cole Brennan", source:"Referral · Northstar FG-LU-5501", employees:7, started:"February 2021", tib:"5 years 7 months",
    entity:"New York LLC", ein:"47-3355501", ssn:"112-80-5501", dob:"January 4, 1988",
    address:"64 N 9th St, Brooklyn, NY 11249", statementAddress:"64 N 9th St, Brooklyn, NY 11249", website:"lumenandco.com",
    lastAgo:"2d ago",
    mobiles:[{l:"Mobile",n:"(347) 555-0177"},{l:"Mobile 2",n:"(917) 555-0177"},{l:"WhatsApp",n:"(347) 555-0177"}],
    landlines:[{l:"Studio",n:"(718) 555-0177"},{l:"Showroom",n:"(718) 555-0178"}],
    emails:[{l:"Work",n:"sable@lumenandco.com"},{l:"Studio",n:"studio@lumenandco.com"},{l:"Personal",n:"sable.whit@gmail.com"}],
    months:[390,410,430,405,448,470,422,418,455,442,438,450],
    monthLabs:["S","O","N","D","J","F","M","A","M","J","J","A"],
    nsf:[0,0,0,0,0,0,0,0,0,0,0,0],
    bank:{name:"Mercury", acct:"2044885501", routing:"121145822", type:"Checking", adb:38800, bal:47450},
    stmts:[{m:"August 2026", dep:450000, end:47450},{m:"July 2026", dep:438000, end:40110},{m:"June 2026", dep:442000, end:37220}],
    mtd:{m:"September 2026", dep:39000, bal:47450, end:47450},
    mca:[],
    expenses:[["Contractors",36000,"per project","Draws are lumpy — retainers land, then subcontractors invoice in a cluster."],["Design payroll",28000,"biweekly"],["Studio rent",6400,"monthly"]],
    files:[{n:"Application",t:"PDF",p:"2p"},{n:"August statement",t:"PDF",p:"5p"},{n:"July statement",t:"PDF",p:"5p"},{n:"June statement",t:"PDF",p:"5p"},{n:"MTD",t:"PDF",p:"1p"}],
    notes:[{who:"Cole Brennan",when:"2d ago",txt:"Elena at Northstar referred. Project-based deposits — lumpy. Need processor statements."}],
    sms:[],
    mails:[{sub:"Intro · Elena Voss referred you",from:"Cole Brennan",to:"sable@lumenandco.com",when:"2d ago",preview:"Sable — Elena suggested we talk. I help shops like yours with project-gap capital."}],
    calls:[],
    activity:[{when:"2d ago",what:"Email intro sent"},{when:"2d ago",what:"Lead created from referral"}],
    use:"Showroom buildout", fav:false, follow:null
  }
];
