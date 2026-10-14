'use strict';
const fflate = require('../vendor/fflate-0.8.3.js');
const TUIYOU_TEMPLATE = require('./template.js');
const g = { fflate, TUIYOU_TEMPLATE };
  const applyDates = ['2025-09-10','2025-10-24','2026-03-05','2026-09-20'];
  const activistDates = ['无','2025-10-17','2026-04-07'];
  const opinionKeys = ['strengths','weaknesses','duties','service','peers','conclusion'];
  const checks = [
    ['identity','姓名、性别、团支部与其他材料一致，照片为本人清晰证件照'],
    ['dates','申请、积极分子时间和曾推优次数已核对个人真实记录'],
    ['annual','已核对2025年09月01日至2026年09月01日完整i志愿记录，未使用累计时长'],
    ['total','累计志愿时长已核对i志愿原始记录'],
    ['votes','会议记录、应到实到人数及原始投票截图与表内数据完全一致，无缺席投票'],
    ['opinion','团支委已核实六项评价，包含不足，未套用他人意见或仅按票数评价'],
    ['signatures','两处电子签名均经实际签名人授权；团支书本人参评时，委员会意见由宣传委员签名'],
    ['publicity','公示名单一致，已向本班团员群实际发送微信文字消息，截图可识别内容、名单和班级'],
    ['eligibility','已核实年满18周岁、团员身份、无禁止推荐情形及适用的组织要求']
  ];
  function text(v) { return String(v ?? '').trim(); }
  function normalized(v) { return text(v).replace(/\(/g,'（').replace(/\)/g,'）'); }
  function dateValid(v) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false; const d=new Date(v+'T00:00:00Z'); return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v; }
  function monthValid(v) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(v || ''); }
  function cnDate(v) { return dateValid(v) ? v.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日') : ''; }
  function cnMonth(v) { return monthValid(v) ? v.replace('-','年')+'月' : ''; }
  function addDays(v,n) { if(!dateValid(v))return ''; const d=new Date(v+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
  function today() { const now=new Date(Date.now()-8*3600000); return now.toISOString().slice(0,10); }
  function dayList(raw) { return text(raw).split(/[\s,，;；]+/).filter(Boolean); }
  function workdayCount(start,end,off=[],on=[]) {
    if(!dateValid(start)||!dateValid(end)||end<start)return 0;
    if((Date.parse(end)-Date.parse(start))/86400000>366)return 0;
    let n=0; for(let d=start;d<=end;d=addDays(d,1)){const dow=new Date(d+'T00:00:00Z').getUTCDay(); if(on.includes(d)||(!off.includes(d)&&dow!==0&&dow!==6))n++;} return n;
  }
  function minutes(h,m) { return Number(h)*60+Number(m); }
  function duration(h,m) { const n=minutes(h,m); return n===0?'无':`${Number(h)}小时${Number(m)}分钟`; }
  function wordCount(v) { return (text(v).match(/[\p{L}\p{N}]/gu)||[]).length; }
  function lineUnits(v,width=29) { return text(v).split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil([...l].reduce((x,c)=>x+(/[^\x00-\xff]/.test(c)?1:0.55),0)/width)),0); }
  function scoreString(r) { return r.none ? '无' : `${text(r.value)} ${text(r.rank)}/${text(r.total)}`; }
  function cadreText(d,status) { const list=(d.cadres||[]).filter(r=>r.status===status); return list.length?list.map(r=>`${normalized(r.name)}（${cnMonth(r.start)}至${status==='现任'?'今':cnMonth(r.end)}）`).join('；'):'无'; }
  function awardText(d) { return d.awards?.length?d.awards.map(r=>`${cnMonth(r.month)}${r.kind==='惩处'?'受到':'获得'}${normalized(r.name)}${r.level?'（'+normalized(r.level)+'）':''}`).join('；'):'无'; }
  function activityText(d) { return d.activities?.length?d.activities.map(r=>`${cnMonth(r.month)}${normalized(r.name)}`).join('；'):'无'; }
  function values(d) {
    const op=opinionKeys.map(k=>normalized(d[k]));
    const days=d.publicPolicy==='natural'?Math.round((Date.parse(d.publicEnd)-Date.parse(d.meetingDate))/86400000)+1:workdayCount(d.meetingDate,d.publicEnd,dayList(d.offDays),dayList(d.onDays));
    const v={name:text(d.name),gender:d.gender,branch:normalized(d.branch),partyClass:d.partyClass,failed:d.failed,annualVolunteer:duration(d.annualHours,d.annualMinutes),applyDate:cnDate(d.applyDate),activistDate:d.activistDate==='无'?'无':cnDate(d.activistDate),recommendations:Number(d.recommendations)+'次',past:cadreText(d,'曾任'),current:cadreText(d,'现任'),awards:awardText(d),activities:activityText(d),meeting:`团支部于${cnDate(d.meetingDate)}在${normalized(d.location)}召开推优大会，应到会具有表决权的团员${Number(d.expected)}人，实到${Number(d.present)}人，经无记名投票表决，${Number(d.yes)}人赞成，${Number(d.no)}人反对，${Number(d.abstain)}人弃权，赞成人数超过应到会具有表决权团员的半数以上，可进入考察环节。`,opinion0:op[0],opinion1:op[1],opinion2:op[2],opinion3:op[3],opinion4:op[4]+op[5],decision:`团支部委员会于${cnDate(d.decisionDate)}研究决定，同意推荐${text(d.name)}同学为${d.target}。`,decisionDate:cnDate(d.decisionDate),publicity:`${cnDate(d.meetingDate)}至${cnDate(d.publicEnd)}对${text(d.name)}同学“推优入党”情况进行了公示，公示期${days}${d.publicPolicy==='natural'?'天':'个工作日'}，公示无异议。`,publicSignatureDate:cnDate(addDays(d.publicEnd,1))};
    for(let i=0;i<3;i++){v['gpa'+i]=scoreString(d.gpa[i]);v['score'+i]=scoreString(d.scores[i]);} return v;
  }
  function validate(d,{now=today(),assets={}}={}) {
    const errors=[],warnings=[];
    const err=(field,message,type='退回修改')=>errors.push({field,message,type});
    const req=(k,label)=>{if(!text(d[k]))err(k,`请填写${label}。`);};
    const num=(k,label,min,max,int=true)=>{const s=text(d[k]);if(!(int?/^\d+$/:/^\d+(\.\d+)?$/).test(s)||!Number.isFinite(Number(s))||Number(s)<min||Number(s)>max)err(k,`${label}须为${min}至${max}之间的${int?'整数':'数值'}。`);};
    req('name','真实姓名'); if(text(d.name).length>20)err('name','姓名过长，请核实。');
    if(!['男','女'].includes(d.gender))err('gender','请选择男或女。');
    req('branch','所在团支部');if(text(d.branch)&&(!/班/.test(d.branch)||!/(20\d{2}|2[3-6])/.test(d.branch)))err('branch','团支部须明确年级及班级，优先使用智慧团建正式全称。');
    if(text(d.branch).length>85)err('branch','团支部名称超过当前模板容量，请核实正式名称。');
    if(!['2023','2024','2025','2026'].includes(d.grade))err('grade','请选择实际年级。');
    if(!['有','无'].includes(d.partyClass))err('partyClass','请如实选择是否参加党课。');
    if(!['是','否'].includes(d.failed))err('failed','请如实选择挂科记录。');
    if(d.failed==='是')err('failed','上一学年挂科，即使补考通过仍属于挂科记录；特别规定须提交学院确认。','不符合通常推优条件');
    if(d.discipline!=='无')err('discipline','存在院内通报批评及以上处分者不能作为推荐候选人。','不符合推优条件');
    if(d.dues!=='否')err('dues','连续3个月未交团费者不能作为推荐候选人。','不符合推优条件');
    const noGrades=d.grade==='2026'&&d.noGrades;
    if(d.noGrades&&d.grade!=='2026')err('noGrades','“尚无大学成绩”仅适用于2026级新生。');
    if(!noGrades){num('cumulativeGpa','在校累计平均学分绩点',0,5,false); if(text(d.cumulativeGpa)&&Number(d.cumulativeGpa)<2)err('cumulativeGpa','在校累计平均学分绩点低于2.0，不符合条件。','不符合推优条件');}
    for(const [key,label,limit] of [['gpa','绩点',5],['scores','综测',100]]){
      for(let i=0;i<3;i++){
        const r=(d[key]||[])[i]||{}, f=`${key}${i}`;
        const required=i<Math.max(0,2026-Number(d.grade));
        if(noGrades&&!r.none)err(f,'尚无大学成绩时，大一至大三相关栏目均须为“无”。');
        if(!noGrades&&required&&r.none)err(f,`已完成的大学学年${label}不可直接填“无”；特殊情况应另行确认。`);
        if(!r.none){
          if(!/^\d+(\.\d{1,4})?$/.test(text(r.value))||Number(r.value)>limit)err(f,`${label}须为0至${limit}之间的实际数值。`);
          if(!/^\d+$/.test(text(r.rank))||!/^\d+$/.test(text(r.total))||Number(r.rank)<1||Number(r.total)<Number(r.rank)||Number(r.total)>10000)err(f,'排名、专业人数须为正整数，排名不能超过总人数。');
          if(!r.evidence)err(f,`请确认本学年${label}数值、排名、专业人数与原始截图一致。`,'退回补证');
        }
      }
    }
    num('annualHours','上一学年志愿小时',0,10000);num('annualMinutes','上一学年志愿分钟',0,59);num('totalHours','累计志愿小时',0,10000);num('totalMinutes','累计志愿分钟',0,59);
    if(minutes(d.totalHours,d.totalMinutes)<300)err('totalHours','累计志愿时长不足5小时。','不符合推优条件');
    if(minutes(d.annualHours,d.annualMinutes)>minutes(d.totalHours,d.totalMinutes))err('annualHours','上一学年时长不能超过累计时长。');
    if(!applyDates.includes(d.applyDate))err('applyDate','请按真实记录选择本批次指定申请日期。');
    if(!activistDates.includes(d.activistDate))err('activistDate','请选择真实的积极分子确定日期，尚未确定选“无”。');
    if(d.activistDate!=='无'&&dateValid(d.activistDate)&&d.activistDate<d.applyDate)err('activistDate','成为积极分子日期不能早于申请入党日期。');
    if(d.activistDate!=='无'&&dateValid(d.activistDate)&&(d.activistDate>now||(dateValid(d.meetingDate)&&d.activistDate>d.meetingDate)))err('activistDate','积极分子日期不得晚于当前日期或本次大会。');
    num('recommendations','此前正式推荐至学院次数',0,50);
    if(!['入党积极分子','发展对象'].includes(d.target))err('target','请选择实际推荐阶段。');
    if(d.target==='发展对象'&&d.activistDate==='无')err('target','发展对象应已有真实积极分子记录。');
    if(d.target==='发展对象')warnings.push('发展对象培养年限、党支部考察及特别要求须由相应组织另行核实。');
    const cadres=d.cadres||[],awards=d.awards||[],activities=d.activities||[];
    if(cadres.length>5)warnings.push('干部经历超过范例建议的5项，建议保留最具代表性的内容。');
    if(awards.length>10)warnings.push('奖惩超过范例建议的10项，建议保留代表性成果。');
    cadres.forEach((r,i)=>{
      const f=`cadre-${i}`;if(!text(r.name)||!monthValid(r.start)||!['曾任','现任'].includes(r.status))err(f,`第${i+1}项干部经历须有真实职务、状态及起始年月。`);
      if(r.start<'2026-09'&&d.grade==='2026')err(f,'干部经历以大学以来为准，请核实入学与任职时间。');
      if(r.status==='曾任'&&(!monthValid(r.end)||r.end<r.start))err(f,'曾任职务须有不早于起始年月的卸任年月。');
      if(r.start>now.slice(0,7)||(r.end&&r.end>now.slice(0,7)))err(f,'干部经历不可使用尚未发生的年月。');
      if(r.newAppointment&&(r.status!=='现任'||r.start<'2026-09'))err(f,'本学年新任免聘书仅适用于2026年09月以来实际新上任的现任职务。');
      if(!r.newAppointment&&!r.evidence)err(f,'历史任职须准备聘书或其他有效任职证明。','退回补证');
      if(!r.university)err(f,'请确认该项为大学以来的真实任职。');
    });
    awards.forEach((r,i)=>{
      const f=`award-${i}`;if(!text(r.name)||!monthValid(r.month)||!['奖励','惩处'].includes(r.kind))err(f,`第${i+1}项奖惩须填写名称、年月及类型。`);
      if(r.month>now.slice(0,7))err(f,'奖惩时间不得晚于当前年月。');
      if(r.kind==='奖励'&&/立项|拟推荐|党课.*(结业|证书)|高中/.test(r.name+' '+r.level))err(f,'立项、拟推荐等级、党课结业及高中奖项不得作为奖励填写。');
      if(!r.university||!r.announced||!r.evidence)err(f,'每项奖惩须确认大学以来、已正式公布、名称等级与有效证明一致。','退回补证');
      if(r.kind==='惩处')warnings.push('已填写惩处，请由团支委核实是否触及禁止推荐范围。');
    });
    activities.forEach((r,i)=>{if(!monthValid(r.month)||!text(r.name))err(`activity-${i}`,`第${i+1}项活动须填写具体年月及内容。`);if(r.month>now.slice(0,7))err(`activity-${i}`,'活动时间不得使用未来年月。');if(!r.truth)err(`activity-${i}`,'请确认活动内容真实。');if(/团员年度评议/.test(r.name))err(`activity-${i}`,'本栏目不填写团员年度评议。');});
    const duplicate=activities.filter(a=>[...cadres,...awards].some(r=>normalized(r.name)===normalized(a.name)));
    if(duplicate.length)warnings.push('活动名称与干部或奖惩栏目重复，建议改写为具体参与内容或删除重复项。');
    for(const [k,label] of [['meetingDate','大会日期'],['decisionDate','团支委研究决定日期'],['publicEnd','公示结束日期']]){if(!dateValid(d[k]))err(k,`请填写有效的${label}。`);else if(d[k]>now)err(k,`${label}尚未发生，请完成实际工作后再填写。`);}
    req('location','大会实际地点');if(text(d.location).length>35)err('location','地点超过模板容量，请使用准确且简洁的地点名称。');
    for(const [k,label] of [['expected','应到人数'],['present','实到人数'],['voting','实际投票人数'],['yes','赞成票'],['no','反对票'],['abstain','弃权票']])num(k,label,k==='expected'?1:0,1000);
    if(Number(d.present)>Number(d.expected))err('present','实到人数不能超过应到有表决权团员人数。');
    if(Number(d.present)*2<=Number(d.expected))err('present','实到有表决权团员须超过应到人数半数。','不符合大会召开条件');
    if(Number(d.voting)>Number(d.present))err('voting','实际投票人数不能超过实到人数，缺席者不得投票。');
    if(Number(d.yes)+Number(d.no)+Number(d.abstain)!==Number(d.voting))err('yes','赞成、反对、弃权之和必须等于实际投票人数。');
    if(Number(d.yes)*2<=Number(d.expected))err('yes','赞成人数必须严格超过应到有表决权团员总人数的50%。','不符合推优条件');
    if(d.attended!=='是')err('attended','候选人必须本人出席大会并进行自我评述。','不符合推优条件');
    if(dateValid(d.meetingDate)&&dateValid(d.decisionDate)&&d.decisionDate<d.meetingDate)err('decisionDate','团支委研究决定日期不能早于大会日期。');
    if(dateValid(d.meetingDate)&&d.applyDate>d.meetingDate)err('applyDate','申请入党时间不得晚于大会。');
    const combined=opinionKeys.map(k=>text(d[k])).join('');
    opinionKeys.forEach((k,i)=>{if(wordCount(d[k])<8)err(k,`请具体填写${['优点及实际表现','不足及改进方向','基础团务完成情况','服务班级同学情况','群众意见和平时表现','团支委综合结论'][i]}。`);});
    if(wordCount(combined)<200)err('strengths',`综合考察正文目前${wordCount(combined)}字，须不少于200字（不含标点、空白和研究决定）。`);
    if(wordCount(combined)>330)err('strengths','意见超过当前模板的保守容量330字，请精炼表述并保留六项内容。');
    if(opinionKeys.some((k,i)=>opinionKeys.slice(i+1).some(j=>text(d[k])&&text(d[k])===text(d[j]))))err('strengths','各项意见存在相同段落，请改为具体、独立的评价。');
    if(d.role!=='member'&&d.role!=='secretary')err('role','请选择候选人身份。');
    req('committeeSigner','委员会意见实际签名人姓名');req('publicSigner','公示实际签名人姓名');
    if(d.role==='secretary'&&text(d.name)===text(d.committeeSigner))err('committeeSigner','团支书本人参评时，须由本班宣传委员代签委员会意见。');
    if(d.role==='secretary'&&text(d.publicSigner)!==text(d.name))err('publicSigner','公示栏按当前要求由本班团支书签名，请核实姓名。');
    if(d.role==='member'&&text(d.committeeSigner)!==text(d.publicSigner))err('committeeSigner','普通团员两处均由本班团支书签名，签名人姓名应一致。');
    for(const k of ['photo','committeeSignature','publicSignature'])if(!assets[k])err(k,`请提供${k==='photo'?'本人证件照':k==='committeeSignature'?'委员会意见电子签名':'公示电子签名'}。`);
    if(!['work','natural'].includes(d.publicPolicy))err('publicPolicy','请选择已由学院确认的公示期限口径。','提交上级确认');
    if(wordCount(d.policySource)<6)err('policySource','请记录学院统一确认口径的通知或答疑来源；存在自然日与工作日冲突。','提交上级确认');
    if([...dayList(d.offDays),...dayList(d.onDays)].some(x=>!dateValid(x)))err('offDays','节假日及调休日期须用YYYY-MM-DD，逗号分隔。');
    if(dayList(d.offDays).some(x=>dayList(d.onDays).includes(x)))err('offDays','同一天不能同时标为休息日和调休工作日。');
    if(d.publicPolicy==='work'&&!d.calendarConfirmed)err('calendarConfirmed','请核实公示区间的节假日及调休；仅按周一至周五计算不足以替代校历。','提交上级确认');
    if(d.publicPolicy==='work'&&workdayCount(d.meetingDate,d.publicEnd,dayList(d.offDays),dayList(d.onDays))<5)err('publicEnd','按当前填写的校历，公示须不少于5个工作日。');
    if(d.publicPolicy==='natural'&&d.publicEnd!==addDays(d.meetingDate,4))err('publicEnd','已确认按5个自然日执行时，结束日应为大会日期加4天。');
    if(d.publicEnd>=now)err('publicEnd','公示尚未完整结束，不得提前填写“公示无异议”。');
    if(addDays(d.publicEnd,1)>now)err('publicEnd','公示签名日期应为结束次日，且不得预填未来日期。');
    if(d.decisionDate>d.publicEnd)err('decisionDate','研究决定晚于公示结束日期，请核实实际流程。');
    if(d.noObjection!=='是')err('noObjection','仅在实际公示结束、确认无异议后，才可生成当前无异议提交表。');
    const allTexts=[d.name,d.branch,d.location,...opinionKeys.map(k=>d[k]),...cadres.map(r=>r.name),...awards.flatMap(r=>[r.name,r.level]),...activities.map(r=>r.name)];
    if(allTexts.some(v=>/(?:\bxx\b|\bxxx\b|模板|填写说明|待填写|某某|示例)/i.test(text(v))))err('name','填写内容仍含xx、模板、某某等占位文字，请逐项删除。');
    if(allTexts.some(v=>/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text(v))))err('name','内容含Word不支持的控制字符，请删除。');
    for(const [key,label] of checks)if(!d.checks?.[key])err('check-'+key,'请核对：'+label+'。','待人工核对');
    if(errors.length===0){const v=values(d);for(const [k,label,w,max] of [['past','曾任经历',27,3],['current','现任经历',27,3],['awards','奖惩',28,5],['activities','活动',28,6]])if(lineUnits(v[k],w)>max)err(k,`${label}超出当前模板的保守文字容量，请精简后重新核验实际页数。`);}
    warnings.push('自动校验与勾选确认不能证明真实性；提交学院初审仍需原始佐证和组织审核。');
    return {errors,warnings,voteRate:Number(d.expected)>0?Number(d.yes)/Number(d.expected)*100:0,opinionCount:wordCount(combined)};
  }
  function xml(v) { return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
  function fromBase64(b) {
    if (typeof wx !== 'undefined' && wx.base64ToArrayBuffer) return new Uint8Array(wx.base64ToArrayBuffer(b));
    if (typeof atob === 'function') { const s=atob(b); return Uint8Array.from(s,c=>c.charCodeAt(0)); }
    throw new Error('当前环境不支持Base64解码。');
  }
  function drawing(id,rel,width,height) {
    return `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${id}" name="填写图片${id}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="图片${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  }
  function generate(d,assets) {
    const zip=g.fflate.unzipSync(fromBase64(g.TUIYOU_TEMPLATE.base64));
    let doc=g.fflate.strFromU8(zip['word/document.xml']);
    let rels=g.fflate.strFromU8(zip['word/_rels/document.xml.rels']);
    const v=values(d);for(const [k,value] of Object.entries(v)){const token='{{'+k+'}}';if(!doc.includes(token))throw new Error('模板字段缺失：'+k);doc=doc.split(token).join(xml(value).replace(/\n/g,'</w:t><w:br/><w:t xml:space="preserve">'));}
    ['photo','committeeSignature','publicSignature'].forEach((key,i)=>{
      if(!assets[key])throw new Error('缺少图片：'+key);
      const asset=assets[key],ext=asset.ext==='jpg'?'jpg':'png',path=`word/media/tuiyou-${key}.${ext}`,rel='rIdTuiyou'+(i+1);
      zip[path]=fromBase64(asset.base64); const ratio=asset.width/asset.height;
      const maxW=key==='photo'?936000:900000,maxH=key==='photo'?1224000:152400;
      const height=Math.round(Math.min(maxH,maxW/ratio)),width=Math.round(height*ratio);
      const fragment=`</w:t></w:r><w:r>${drawing(1000+i,rel,width,height)}</w:r><w:r><w:t xml:space="preserve">`;
      doc=doc.replace('{{'+key+'}}',fragment);
      rels=rels.replace('</Relationships>',`<Relationship Id="${rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/tuiyou-${key}.${ext}"/></Relationships>`);
    });
    if(/\{\{[^}]+\}\}/.test(doc))throw new Error('模板存在未填字段。');
    zip['word/document.xml']=g.fflate.strToU8(doc);zip['word/_rels/document.xml.rels']=g.fflate.strToU8(rels);
    let ct=g.fflate.strFromU8(zip['[Content_Types].xml']);
    if(!/Extension="png"/.test(ct))ct=ct.replace('</Types>','<Default Extension="png" ContentType="image/png"/></Types>');
    if(Object.values(assets||{}).some(a=>a&&a.ext==='jpg')&&!/Extension="jpg"/.test(ct))ct=ct.replace('</Types>','<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
    zip['[Content_Types].xml']=g.fflate.strToU8(ct);
    return g.fflate.zipSync(zip,{level:6});
  }
  module.exports={applyDates,activistDates,opinionKeys,checks,validate,values,generate,cnDate,cnMonth,addDays,today,workdayCount,wordCount,lineUnits,scoreString,duration};
