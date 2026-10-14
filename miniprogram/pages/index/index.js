'use strict';

const T = require('../../lib/engine.js');
const PDFLib = require('../../vendor/pdf-lib-1.17.1.js');

const RULES_DATE = '2026-10-13';
const DRAFT_KEY = 'tuiyou-mini-draft-v1';
const fs = wx.getFileSystemManager();

function wxp(name, options = {}) {
  return new Promise((resolve, reject) => {
    wx[name]({...options, success: resolve, fail: reject});
  });
}

function emptyScore(none = false) {
  return { none, value: '', rank: '', total: '', evidence: false };
}

function initialForm() {
  return {
    name: '', gender: '', grade: '2026', role: '', branch: '',
    partyClass: '', failed: '', applyDate: '', activistDate: '',
    recommendations: '0', target: '', noGrades: false, cumulativeGpa: '',
    gpa: [emptyScore(false), emptyScore(true), emptyScore(true)],
    scores: [emptyScore(false), emptyScore(true), emptyScore(true)],
    annualHours: '0', annualMinutes: '0', totalHours: '0', totalMinutes: '0',
    discipline: '', dues: '',
    cadres: [], awards: [], activities: [],
    meetingDate: '', location: '', expected: '', present: '', voting: '',
    yes: '', no: '', abstain: '', attended: '',
    strengths: '', weaknesses: '', duties: '', service: '', peers: '', conclusion: '',
    decisionDate: '', committeeSigner: '', publicSigner: '',
    publicPolicy: '', policySource: '', publicEnd: '', offDays: '', onDays: '',
    calendarConfirmed: false, noObjection: '', pdfMatch: false,
    checks: Object.fromEntries(T.checks.map(([key]) => [key, false]))
  };
}

function arrayBufferFrom(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function safeFilename(name) {
  return String(name || '未填姓名').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
}

function fingerprint(bytes) {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + '-' + bytes.length;
}

Page({
  data: {
    step: 0,
    stepNames: ['基本情况','成绩与志愿','经历与奖惩','推优大会','综合考察意见','电子签名','公示情况','核验与下载'],
    stepTips: [
      '与名单一致，按真实情况填写。',
      '学年成绩、累计绩点与志愿时长各归其位。',
      '保留代表性经历，做好必要佐证。',
      '把日期、人数和原始投票记录对齐。',
      '由团支委填写具体、有区分度的意见。',
      '核对实际签名人和被推荐人身份。',
      '口径确认、实际公示完成后如实填写。',
      '逐项核对后生成材料。'
    ],
    form: initialForm(),
    genderOptions: ['男','女'],
    gradeOptions: ['2026','2025','2024','2023'],
    roleOptions: [
      {label:'普通团员（含其他班委）',value:'member'},
      {label:'本班团支书',value:'secretary'}
    ],
    yesNoOptions: ['是','否'],
    haveOptions: ['有','无'],
    targetOptions: ['入党积极分子','发展对象'],
    statusOptions: ['曾任','现任'],
    kindOptions: ['奖励','惩处'],
    applyDateOptions: T.applyDates.map(v => ({label:T.cnDate(v), value:v})),
    activistDateOptions: T.activistDates.map(v => ({label:v === '无' ? '无' : T.cnDate(v), value:v})),
    publicPolicyOptions: [
      {label:'一般不少于5个工作日',value:'work'},
      {label:'严格5个自然日（须学院确认）',value:'natural'}
    ],
    checks: T.checks.map(([key,label]) => ({key,label,checked:false})),
    errors: [],
    warnings: [],
    voteRate: '—',
    opinionCount: 0,
    issueCount: '—',
    validated: false,
    imageState: {
      photo: {ready:false,label:'未选择'},
      committeeSignature: {ready:false,label:'未选择'},
      publicSignature: {ready:false,label:'未选择'}
    },
    docStatus: '尚未生成当前校对稿。',
    pdfStatus: '待校对稿生成后核验。',
    draftReady: false,
    pdfPages: 0,
    finalReady: false,
    noticeText: '',
    publicStartText: '',
    publicSignText: '',
    publicCalc: '请选择执行口径并填写日期。',
    hasLocalDraft: false
  },

  onLoad() {
    this.assets = {};
    this.revision = 0;
    this.docxDraft = null;
    this.pdfCheck = null;
    this.refreshDerived();
    try {
      this.setData({hasLocalDraft: !!wx.getStorageSync(DRAFT_KEY)});
    } catch (_) {}
  },

  bindField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({['form.' + key]: e.detail.value});
    this.invalidate();
    this.refreshDerived();
  },

  bindDate(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({['form.' + key]: e.detail.value});
    this.invalidate();
    this.refreshDerived();
  },

  bindPicker(e) {
    const key = e.currentTarget.dataset.key;
    const source = e.currentTarget.dataset.source;
    const list = this.data[source] || [];
    const item = list[Number(e.detail.value)];
    const value = item && typeof item === 'object' ? item.value : item;
    this.setData({['form.' + key]: value || ''});
    this.invalidate();
    this.refreshDerived();
  },

  bindSwitch(e) {
    const key = e.currentTarget.dataset.key;
    const value = !!e.detail.value;
    const patch = {['form.' + key]: value};
    if (key === 'noGrades' && value && this.data.form.grade === '2026') {
      for (const group of ['gpa','scores']) {
        for (let i=0;i<3;i++) patch['form.'+group+'['+i+'].none'] = true;
      }
    }
    this.setData(patch);
    this.invalidate();
    this.refreshDerived();
  },

  bindScoreField(e) {
    const group = e.currentTarget.dataset.group;
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    this.setData({['form.'+group+'['+index+'].'+key]: e.detail.value});
    this.invalidate();
    this.refreshDerived();
  },

  bindScoreSwitch(e) {
    const group = e.currentTarget.dataset.group;
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    this.setData({['form.'+group+'['+index+'].'+key]: !!e.detail.value});
    this.invalidate();
    this.refreshDerived();
  },

  addRecord(e) {
    const type = e.currentTarget.dataset.type;
    const list = (this.data.form[type] || []).slice();
    if (list.length >= 30) {
      wx.showToast({title:'列表最多30项',icon:'none'});
      return;
    }
    if (type === 'cadres') list.push({name:'',status:'现任',start:'',end:'',university:false,newAppointment:false,evidence:false});
    if (type === 'awards') list.push({name:'',level:'',month:'',kind:'奖励',university:false,announced:false,evidence:false});
    if (type === 'activities') list.push({month:'',name:'',truth:false});
    this.setData({['form.'+type]: list});
    this.invalidate();
  },

  removeRecord(e) {
    const type = e.currentTarget.dataset.type;
    const index = Number(e.currentTarget.dataset.index);
    const list = (this.data.form[type] || []).slice();
    list.splice(index,1);
    this.setData({['form.'+type]: list});
    this.invalidate();
  },

  bindRecordField(e) {
    const type = e.currentTarget.dataset.type;
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    this.setData({['form.'+type+'['+index+'].'+key]: e.detail.value});
    this.invalidate();
  },

  bindRecordSwitch(e) {
    const type = e.currentTarget.dataset.type;
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    this.setData({['form.'+type+'['+index+'].'+key]: !!e.detail.value});
    this.invalidate();
  },

  bindRecordPicker(e) {
    const type = e.currentTarget.dataset.type;
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    const options = key === 'status' ? ['曾任','现任'] : ['奖励','惩处'];
    this.setData({['form.'+type+'['+index+'].'+key]: options[Number(e.detail.value)]});
    this.invalidate();
  },

  bindCheck(e) {
    const key = e.currentTarget.dataset.key;
    const checked = !!e.detail.value;
    const checks = this.data.checks.map(x => x.key === key ? {...x,checked} : x);
    this.setData({
      checks,
      ['form.checks.'+key]: checked
    });
    this.invalidate();
  },

  goStep(e) {
    this.setData({step:Number(e.currentTarget.dataset.step)});
    wx.pageScrollTo({scrollTop:0,duration:0});
  },

  previous() {
    if (this.data.step > 0) this.setData({step:this.data.step-1});
    wx.pageScrollTo({scrollTop:0,duration:0});
  },

  next() {
    if (this.data.step < 7) this.setData({step:this.data.step+1});
    wx.pageScrollTo({scrollTop:0,duration:0});
  },

  invalidate() {
    this.revision += 1;
    this.docxDraft = null;
    this.pdfCheck = null;
    if (this.data.form.pdfMatch) this.setData({'form.pdfMatch':false});
    this.setData({
      draftReady:false,
      pdfPages:0,
      finalReady:false,
      docStatus:'填写已变化，请重新生成校对稿。',
      pdfStatus:'填写已变化，原页数核验已失效。'
    });
  },

  refreshDerived() {
    const d = this.data.form;
    const rate = Number(d.expected) > 0 ? (Number(d.yes)/Number(d.expected)*100).toFixed(2)+'%' : '—';
    const opinionCount = T.wordCount(T.opinionKeys.map(k => d[k]).join(''));
    const publicStartText = T.cnDate(d.meetingDate);
    const publicSignText = T.cnDate(T.addDays(d.publicEnd,1));
    let publicCalc = '请选择执行口径并填写日期。';
    if (d.meetingDate && d.publicEnd && d.publicPolicy) {
      const days = d.publicPolicy === 'natural'
        ? Math.round((Date.parse(d.publicEnd)-Date.parse(d.meetingDate))/86400000)+1
        : T.workdayCount(d.meetingDate,d.publicEnd,String(d.offDays||'').split(/[,，\s]+/).filter(Boolean),String(d.onDays||'').split(/[,，\s]+/).filter(Boolean));
      publicCalc = '当前计算：'+days+(d.publicPolicy==='natural'?'个自然日':'个工作日')+'。公示签字日期：'+(publicSignText||'待填写')+'。';
    }
    const noticeText = [
      '推优入党公示','',
      '根据本班推优大会与团支委综合考察情况，现对以下同学予以公示：',
      (d.branch || '〔实际团支部全称〕')+'：'+(d.name || '〔候选人姓名〕'),
      '公示时间：'+(T.cnDate(d.meetingDate)||'〔开始日期〕')+'至'+(T.cnDate(d.publicEnd)||'〔结束日期〕')+'。',
      '如有异议，请在公示期内向本班团支部或学院团组织反映。',
      '（实际发送前请补齐多人名单及学院要求的联系方式，确认与最终汇总名单一致。）'
    ].join('\n');
    this.setData({voteRate:rate,opinionCount,publicStartText,publicSignText,publicCalc,noticeText});
  },

  validateAll(show = true) {
    const result = T.validate(this.data.form,{assets:this.assets || {}});
    this.lastValidation = result;
    const finalReady = result.errors.length === 0 &&
      !!this.docxDraft &&
      this.pdfCheck && this.pdfCheck.pages === 2 &&
      this.pdfCheck.revision === this.revision &&
      !!this.data.form.pdfMatch;
    this.setData({
      errors:result.errors,
      warnings:result.warnings,
      issueCount:result.errors.length,
      validated:true,
      finalReady
    });
    if (show) {
      wx.showToast({
        title: result.errors.length ? '还有'+result.errors.length+'项待处理' : '校验通过',
        icon: result.errors.length ? 'none' : 'success'
      });
    }
    return result.errors.length === 0;
  },

  async chooseImage(e) {
    const key = e.currentTarget.dataset.key;
    try {
      const choose = await wxp('chooseMedia',{count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed']});
      const file = choose.tempFiles && choose.tempFiles[0];
      if (!file) return;
      if (file.size > 2*1024*1024) throw new Error('图片不得超过2MB，请先压缩');
      const info = await wxp('getImageInfo',{src:file.tempFilePath});
      const read = await new Promise((resolve,reject) => fs.readFile({
        filePath:file.tempFilePath,
        encoding:'base64',
        success:resolve,
        fail:reject
      }));
      const base64 = read.data;
      let ext = '';
      if (base64.startsWith('iVBOR')) ext = 'png';
      else if (base64.startsWith('/9j/')) ext = 'jpg';
      else throw new Error('仅支持PNG或JPG图片');
      if (key === 'photo' && (info.width < 150 || info.height < 180)) throw new Error('证件照分辨率过低');
      this.assets[key] = {base64, width:info.width, height:info.height, ext};
      this.invalidate();
      this.setData({
        ['imageState.'+key]: {ready:true,label:info.width+' × '+info.height+' · '+ext.toUpperCase()}
      });
      this.validateAll(false);
    } catch (err) {
      if (!String(err && err.errMsg || '').includes('cancel')) {
        wx.showToast({title:err.message || '图片读取失败',icon:'none'});
      }
    }
  },

  async generateDraft() {
    if (!this.validateAll(true)) return;
    wx.showLoading({title:'生成Word中',mask:true});
    try {
      const bytes = T.generate(this.data.form,this.assets);
      const fp = fingerprint(bytes);
      const revision = this.revision;
      this.docxDraft = {bytes, fingerprint:fp, revision};
      this.pdfCheck = null;
      this.setData({
        draftReady:true,
        pdfPages:0,
        finalReady:false,
        'form.pdfMatch':false,
        docStatus:'已生成当前校对稿 · '+fp,
        pdfStatus:'请在Word/WPS检查后导出PDF，再回到这里核验严格2页。'
      });
      await this.writeAndOpenDocx(bytes,'校对稿');
    } catch (err) {
      wx.showModal({title:'生成失败',content:err.message || String(err),showCancel:false});
    } finally {
      wx.hideLoading();
    }
  },

  writeAndOpenDocx(bytes,suffix) {
    return new Promise((resolve,reject) => {
      const path = wx.env.USER_DATA_PATH + '/' + safeFilename(this.data.form.name) + '-推优入党综合考察表_' + suffix + '.docx';
      fs.writeFile({
        filePath:path,
        data:arrayBufferFrom(bytes),
        success:() => {
          wx.openDocument({
            filePath:path,
            fileType:'docx',
            showMenu:true,
            success:resolve,
            fail:reject
          });
        },
        fail:reject
      });
    });
  },

  choosePdf() {
    if (!this.docxDraft || this.docxDraft.revision !== this.revision) {
      wx.showToast({title:'请先生成当前校对稿',icon:'none'});
      return;
    }
    wx.chooseMessageFile({
      count:1,
      type:'file',
      extension:['pdf'],
      success: async res => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        if (file.size > 20*1024*1024) {
          wx.showToast({title:'PDF不得超过20MB',icon:'none'});
          return;
        }
        wx.showLoading({title:'读取PDF'});
        try {
          const read = await new Promise((resolve,reject) => fs.readFile({filePath:file.path,success:resolve,fail:reject}));
          const pdf = await PDFLib.PDFDocument.load(read.data);
          const pages = pdf.getPageCount();
          this.pdfCheck = {pages,revision:this.revision,docxFingerprint:this.docxDraft.fingerprint};
          this.setData({
            pdfPages:pages,
            'form.pdfMatch':false,
            pdfStatus:pages === 2 ? '已读取PDF：严格2页。请确认它来自当前校对稿且内容完整。' : '已读取PDF：'+pages+'页，不符合严格2页要求。',
            finalReady:false
          });
        } catch (err) {
          wx.showModal({title:'PDF核验失败',content:err.message || String(err),showCancel:false});
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  togglePdfMatch(e) {
    this.setData({'form.pdfMatch':!!e.detail.value});
    this.validateAll(false);
  },

  async openFinal() {
    if (!this.validateAll(false) || !this.data.finalReady || !this.docxDraft) {
      wx.showToast({title:'提交稿条件尚未满足',icon:'none'});
      return;
    }
    wx.showLoading({title:'打开提交稿'});
    try {
      await this.writeAndOpenDocx(this.docxDraft.bytes,'提交稿');
    } catch (err) {
      wx.showModal({title:'打开失败',content:err.message || String(err),showCancel:false});
    } finally {
      wx.hideLoading();
    }
  },

  copyNotice() {
    wx.setClipboardData({data:this.data.noticeText});
  },

  copyReport() {
    const r = this.lastValidation || T.validate(this.data.form,{assets:this.assets || {}});
    const d = this.data.form;
    const lines = [
      '推优入党综合考察表核对记录',
      '审核口径：'+RULES_DATE,
      '姓名：'+d.name,
      '团支部：'+d.branch,
      '自动校验问题：'+r.errors.length+'项',
      '赞成票/应到人数：'+d.yes+'/'+d.expected+'（'+r.voteRate.toFixed(4)+'%）',
      '考察正文：'+r.opinionCount+'字',
      'DOCX校对稿指纹：'+(this.docxDraft ? this.docxDraft.fingerprint : '未生成'),
      'PDF页数：'+(this.pdfCheck ? this.pdfCheck.pages : 'NOT_RUN'),
      'PDF来自当前校对稿且内容完整：'+(d.pdfMatch?'填写人已确认':'未确认'),
      '',
      '问题：',
      ...r.errors.map(x => '- '+x.type+'：'+x.message),
      '',
      '校验边界：本工具仅辅助填写，不认证证书、截图、签名或事实真实性；最终由组织审核。'
    ];
    wx.setClipboardData({data:lines.join('\n')});
  },


  draftJsonFilename() {
    const d = new Date(), pad = v => String(v).padStart(2,'0');
    return 'gdufe-bdai-tuiyou-docx-' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.json';
  },

  exportJsonDraft() {
    try {
      const form = this.data.form;
      const validation = T.validate(form,{assets:this.assets || {}});
      const payload = {
        version:2, rulesDate:RULES_DATE, exportedAt:new Date().toISOString(),
        data:form, assets:this.assets || {},
        validationSnapshot:{executed:this.data.validated,errors:validation.errors,warnings:validation.warnings,passed:validation.errors.length===0,revision:this.revision},
        checkSnapshot:{
          humanChecks:form.checks,
          scoreEvidence:{gpa:form.gpa.map(x=>!!x.evidence),scores:form.scores.map(x=>!!x.evidence)},
          recordChecks:Object.fromEntries(['cadres','awards','activities'].map(k=>[k,form[k].map(x=>Object.fromEntries(Object.entries(x).filter(([,v])=>typeof v==='boolean')))])),
          calendarConfirmed:!!form.calendarConfirmed,pdfMatch:!!form.pdfMatch
        },
        verificationSnapshot:{docxHash:this.docxDraft?.fingerprint||null,pdfPages:this.data.pdfPages||null}
      };
      const name=this.draftJsonFilename();
      const path=wx.env.USER_DATA_PATH+'/'+name;
      fs.writeFile({filePath:path,data:JSON.stringify(payload,null,2),encoding:'utf8',success:()=>{
        wx.shareFileMessage({filePath:path,fileName:name,success:()=>{},fail:()=>wx.showModal({title:'草稿已保存到小程序文件',content:path,showCancel:false})});
      },fail:e=>wx.showModal({title:'导出失败',content:e.errMsg||'文件写入失败',showCancel:false})});
    } catch(e) { wx.showModal({title:'导出失败',content:e.message||'无法生成JSON',showCancel:false}); }
  },

  async importJsonDraft() {
    try {
      const pick=await wxp('chooseMessageFile',{count:1,type:'file',extension:['json']});
      const file=pick.tempFiles?.[0];
      if(!file)return;
      if(file.size>15*1024*1024)throw new Error('草稿文件不能超过15MB');
      const content=await new Promise((resolve,reject)=>fs.readFile({filePath:file.path,encoding:'utf8',success:r=>resolve(r.data),fail:reject}));
      const p=JSON.parse(content);
      if(![1,2].includes(p.version)||p.rulesDate!==RULES_DATE)throw new Error('草稿版本或审核批次不匹配');
      const source=p.data||p.form;
      if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('草稿填写内容无效');
      for(const k of ['gpa','scores','cadres','awards','activities'])if(!Array.isArray(source[k])||((k==='gpa'||k==='scores')?source[k].length!==3:source[k].length>30))throw new Error('草稿列表结构不正确');
      const assets={};
      for(const k of ['photo','committeeSignature','publicSignature']){
        const a=p.assets?.[k];
        if(!a)continue;
        if(typeof a.base64!=='string'||a.base64.length>4*1024*1024||!Number.isFinite(a.width)||!Number.isFinite(a.height)||a.width<=0||a.height<=0)throw new Error('草稿图片数据无效');
        assets[k]=a;
      }
      const ok=await new Promise(resolve=>wx.showModal({title:'导入JSON草稿',content:'将覆盖当前表单与勾选状态。历史校验结果仅作快照；导入后重新计算，DOCX和PDF需重新核验。',success:r=>resolve(r.confirm),fail:()=>resolve(false)}));
      if(!ok)return;
      this.assets=assets;
      const form={...initialForm(),...source,checks:{...initialForm().checks,...source.checks}};
      form.pdfMatch=false;
      const checks=T.checks.map(([key,label])=>({key,label,checked:!!form.checks[key]}));
      const imageState={};
      for(const k of ['photo','committeeSignature','publicSignature']){
        const a=assets[k];imageState[k]=a?{ready:true,label:a.width+' × '+a.height+' · 已从草稿导入'}:{ready:false,label:'未选择'};
      }
      this.revision+=1;this.docxDraft=null;this.pdfCheck=null;
      this.setData({form,checks,imageState,step:0,validated:false,errors:[],warnings:[],issueCount:'—',draftReady:false,pdfPages:0,finalReady:false,docStatus:'草稿已导入，请重新生成校对稿。',pdfStatus:'页数核验需重新执行。'});
      this.refreshDerived();
      if(p.validationSnapshot?.executed)this.validateAll(false);
      wx.showToast({title:'JSON草稿已导入',icon:'success'});
    }catch(e){wx.showModal({title:'无法导入草稿',content:e.message||'无法读取JSON文件',showCancel:false});}
  },

  saveLocalDraft() {
    try {
      const payload = {
        version:1,
        rulesDate:RULES_DATE,
        form:this.data.form,
        assets:this.assets
      };
      wx.setStorageSync(DRAFT_KEY,payload);
      this.setData({hasLocalDraft:true});
      wx.showToast({title:'已保存到本机',icon:'success'});
    } catch (err) {
      wx.showModal({title:'保存草稿失败',content:'图片可能过大，请压缩后重试。\n'+(err.message||''),showCancel:false});
    }
  },

  restoreLocalDraft() {
    try {
      const payload = wx.getStorageSync(DRAFT_KEY);
      if (!payload || payload.version !== 1 || payload.rulesDate !== RULES_DATE) throw new Error('没有可用的当前批次草稿');
      this.assets = payload.assets || {};
      const form = {...initialForm(),...(payload.form||{})};
      const checks = T.checks.map(([key,label]) => ({key,label,checked:!!form.checks?.[key]}));
      const imageState = {...this.data.imageState};
      for (const key of ['photo','committeeSignature','publicSignature']) {
        const a=this.assets[key];
        imageState[key]=a ? {ready:true,label:a.width+' × '+a.height+' · '+String(a.ext||'png').toUpperCase()} : {ready:false,label:'未选择'};
      }
      this.revision += 1;
      this.docxDraft = null;
      this.pdfCheck = null;
      form.pdfMatch = false;
      this.setData({
        form,checks,imageState,step:0,validated:false,errors:[],warnings:[],issueCount:'—',
        draftReady:false,pdfPages:0,finalReady:false,
        docStatus:'草稿已恢复，请重新生成校对稿。',
        pdfStatus:'页数核验需重新执行。'
      });
      this.refreshDerived();
      wx.showToast({title:'草稿已恢复',icon:'success'});
    } catch (err) {
      wx.showToast({title:err.message || '恢复失败',icon:'none'});
    }
  },

  clearLocalDraft() {
    wx.showModal({
      title:'清除本机草稿',
      content:'将删除小程序本地保存的姓名、填写内容、照片和签名。',
      success:res => {
        if (!res.confirm) return;
        wx.removeStorageSync(DRAFT_KEY);
        this.setData({hasLocalDraft:false});
        wx.showToast({title:'已清除',icon:'success'});
      }
    });
  }
});
