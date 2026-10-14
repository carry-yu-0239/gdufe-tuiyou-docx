'use strict';

const assert = require('assert');
const T = require('../miniprogram/lib/engine.js');
const fflate = require('../miniprogram/vendor/fflate-0.8.3.js');

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const d = {
  name:'测试同学', gender:'男', grade:'2026', role:'member',
  branch:'2026级计算机科学与技术1班团支部',
  partyClass:'无', failed:'否', applyDate:'2026-09-20', activistDate:'无',
  recommendations:'0', target:'入党积极分子', noGrades:true, cumulativeGpa:'',
  gpa:[0,1,2].map(()=>({none:true,value:'',rank:'',total:'',evidence:false})),
  scores:[0,1,2].map(()=>({none:true,value:'',rank:'',total:'',evidence:false})),
  annualHours:'0', annualMinutes:'0', totalHours:'5', totalMinutes:'0',
  discipline:'无', dues:'否', cadres:[], awards:[], activities:[],
  meetingDate:'2026-10-01', location:'厚德楼432',
  expected:'20', present:'20', voting:'20', yes:'20', no:'0', abstain:'0', attended:'是',
  strengths:'学习态度认真，能够主动完成课程任务，并在集体工作中保持责任心和执行力。',
  weaknesses:'时间安排仍可进一步优化，面对多任务并行时需要提升优先级管理和复盘能力。',
  duties:'能够按要求参加团组织生活，完成团费缴纳和团支部安排的基础团务事项。',
  service:'能够主动参与班级事务，在同学需要协助时及时回应，并配合完成集体任务。',
  peers:'与同学相处融洽，日常表现稳定，能够听取意见并在合作中保持良好沟通。',
  conclusion:'团支委综合其学习、工作和日常表现，认为其具备继续培养和考察的基础。',
  decisionDate:'2026-10-01', committeeSigner:'团支书甲', publicSigner:'团支书甲',
  publicPolicy:'natural', policySource:'学院2026年10月统一答疑记录',
  publicEnd:'2026-10-05', offDays:'', onDays:'', calendarConfirmed:false, noObjection:'是',
  checks:Object.fromEntries(T.checks.map(([k])=>[k,true]))
};

const assets = {
  photo:{base64:png,width:300,height:400,ext:'png'},
  committeeSignature:{base64:png,width:300,height:80,ext:'png'},
  publicSignature:{base64:png,width:300,height:80,ext:'png'}
};

const bytes = T.generate(d, assets);
assert(bytes instanceof Uint8Array);
assert(bytes.length > 1000);

const zip = fflate.unzipSync(bytes);
assert(zip['word/document.xml']);
assert(zip['word/media/tuiyou-photo.png']);
assert(zip['word/media/tuiyou-committeeSignature.png']);
assert(zip['word/media/tuiyou-publicSignature.png']);

const xml = fflate.strFromU8(zip['word/document.xml']);
assert(!/\{\{[^}]+\}\}/.test(xml));
assert(xml.includes('测试同学'));
assert(xml.includes('厚德楼432'));

console.log('Mini Program DOCX engine smoke test passed:', bytes.length, 'bytes');
