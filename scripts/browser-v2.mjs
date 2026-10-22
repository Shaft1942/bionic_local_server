// Synthetic UI contracts: no model, personal project, GPU or external website.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,...(process.env.BIONIC_BROWSER_CHANNEL?{channel:process.env.BIONIC_BROWSER_CHANNEL}:{})});
const captures=process.env.BIONIC_SMOKE_SCREENSHOTS;if(captures)await fs.mkdir(captures,{recursive:true});
const results=[],origin='http://bionic.test';
try{
  for(const width of [1280,320]){
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],writes=[],sends=[];let tests=0;
    page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
    const models=['a','b'].map(id=>({id,name:'Modèle '+id,type:'llm',tools:true,contextLength:16384,reasoning:{allowedOptions:[],default:'default'}}));
    let comfy={enabled:false,url:'http://127.0.0.1:8188',workflowId:'krea2_turbo',activeJobs:0,workflows:[{id:'krea2_turbo',label:'Krea2 Turbo'},{id:'hassaku_illustrious',label:'Hassaku XL Illustrious v34'}]};
    const defaults=new Map();let sentChat;
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
      if(!url.pathname.startsWith('/api/')){const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!/^[\w.-]+$/.test(file))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/svg+xml',body:await fs.readFile(path.join(root,'public',file))});}
      const input=request.postData()?JSON.parse(request.postData()):null;let data={};
      if(url.pathname==='/api/status')data={ok:true,models,addresses:[]};
      else if(url.pathname==='/api/projects')data={projects:[{id:'p1',name:'Projet de test',sessionsCount:0}]};
      else if(url.pathname==='/api/sessions')data={sessions:sentChat?[sentChat]:[],warnings:[]};
      else if(url.pathname==='/api/activity')data={events:[],warnings:[]};
      else if(url.pathname==='/api/updates')data={currentVersion:'2.0.0',enabled:false,canInstall:false,installation:{status:'idle'}};
      else if(url.pathname==='/api/comfy/settings'){if(input){writes.push({type:'comfy',...input});comfy={...comfy,...input};}data=comfy;}
      else if(url.pathname==='/api/comfy/check'){tests++;assert.equal(input.workflowId,'hassaku_illustrious');data={ok:true,url:input.url,workflows:[{id:input.workflowId,compatible:true,errors:[]}]};}
      else if(url.pathname==='/api/capabilities')data={items:[{name:'Scripts sur le PC',description:'Validation du code exact. 120 secondes maximum.'},{name:'Bionic Desktop',description:'MCP et sous-agents non hérités.'}]};
      else if(url.pathname==='/api/model-preferences'){
        if(input){writes.push({type:'output',...input});if(input.applyToAllSessions)defaults.set(input.model,input.maxOutputTokens);}
        const model=input?.model||url.searchParams.get('model'),value=defaults.get(model)??null;data={model,contextLength:16384,maxOutputTokens:value??8192,automatic:value===null,source:value===null?'auto':'model',applyToAllSessions:value!==null};
      }
      else if(url.pathname==='/api/chat'){
        sends.push(input);sentChat={id:'web-11111111-1111-4111-8111-111111111111',projectId:'p1',name:input.text,source:'web',messages:[{id:'u',role:'user',text:input.text},{id:'r',role:'assistant',text:'Réponse synthétique coupée.',truncated:true,complete:true,outputBudget:{maxOutputTokens:777}}],generation:{status:'completed',requestId:input.requestId,replyId:'r'}};
        return route.fulfill({contentType:'application/x-ndjson',body:[{type:'start',id:sentChat.id,replyId:'r',requestId:input.requestId},{type:'delta',text:'Réponse synthétique coupée.'},{type:'done',id:sentChat.id,replyId:'r',limited:true,truncated:true,finishReason:'length',outputBudget:{maxOutputTokens:777}}].map(x=>JSON.stringify(x)+'\n').join('')});
      }
      else if(url.pathname==='/api/conversation')data=sentChat;
      else if(url.pathname==='/api/chat-request')data={id:sentChat?.id,status:'completed',projectId:'p1'};
      else if(url.pathname==='/api/ping')data={app:'bionic-mobile-local',version:'2.0.0'};
      else if(url.pathname==='/api/logout')data={ok:true};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});await page.locator('#project').selectOption('p1');
    await page.locator('#settings-open-sidebar').click();await page.locator('#output-current').getByText(/Contexte du modèle/).waitFor();
    assert.equal(await page.locator('#app').isVisible(),false);
    const precise=page.locator('#output-tokens'),slider=page.getByRole('slider',{name:'Ajuster avec le curseur'});
    assert.equal(await precise.isDisabled(),true);
    await page.locator('#output-mode').selectOption('manual');
    assert.equal(await slider.getAttribute('min'),'1');assert.equal(await slider.getAttribute('max'),'5000000');assert.equal(await precise.getAttribute('max'),'5000000');
    await precise.fill('12345');assert.equal(await slider.inputValue(),'12345');
    await slider.press('Home');assert.equal(await precise.inputValue(),'1');
    await slider.press('End');assert.equal(await precise.inputValue(),'5000000');
    await slider.press('ArrowLeft');assert.equal(await precise.inputValue(),'4999999');
    await precise.fill('5000001');assert.equal(await precise.evaluate(input=>input.checkValidity()),false);
    await page.locator('#output-save').click();assert.equal(await page.locator('#output-result').textContent(),'');
    await page.locator('#output-mode').selectOption('auto');assert.equal(await precise.isDisabled(),true);assert.equal(await page.locator('#output-tokens-slider').isDisabled(),true);
    await page.locator('#output-save').click();await page.getByText('Réglage prêt pour le premier envoi de cette conversation.').waitFor();
    await page.locator('#output-mode').selectOption('manual');await precise.fill('777');
    await page.locator('#output-save').click();await page.getByText('Réglage prêt pour le premier envoi de cette conversation.').waitFor();assert.equal(writes.filter(w=>w.type==='output').length,0);
    await page.locator('#settings-model').selectOption('b');await page.getByText(/Contexte du modèle/).waitFor();assert.equal(await page.locator('#output-mode').inputValue(),'auto');
    await page.locator('#output-mode').selectOption('manual');await precise.fill('5000000');await page.locator('#output-all-sessions').check();await page.locator('#output-save').click();await page.getByText('Valeur par défaut enregistrée pour ce modèle.').waitFor();assert.equal(writes.at(-1).model,'b');assert.equal(writes.at(-1).applyToAllSessions,true);assert.equal(writes.at(-1).maxOutputTokens,5000000);
    await page.locator('#settings-model').selectOption('a');await page.waitForFunction(()=>document.querySelector('#output-tokens').value==='777');
    await page.locator('#settings-model').selectOption('b');await page.waitForFunction(()=>document.querySelector('#output-tokens-slider').value==='5000000');assert.equal(await precise.inputValue(),'5000000');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(captures){await slider.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(captures,width+'-v2-token-slider.png')});}
    await page.locator('#comfy-enabled').check();await page.locator('#comfy-url').fill('http://192.168.1.197:8188');await page.locator('#comfy-workflow').selectOption('hassaku_illustrious');
    await page.locator('#comfy-test').click();await page.getByText(/Connexion confirmée/).waitFor();assert.equal(tests,1);assert.equal(writes.filter(w=>w.type==='comfy').length,0);
    await page.locator('#comfy-save').click();await page.getByText(/Configuration enregistrée/).waitFor();assert.equal(writes.at(-1).workflowId,'hassaku_illustrious');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(captures)await page.screenshot({path:path.join(captures,width+'-v2-settings.png'),fullPage:true});
    await page.locator('#comfy-url').press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-open-sidebar');assert.equal(await page.locator('#settings-view').isVisible(),false);
    await page.locator('#new-chat').click();await page.locator('#model').selectOption('a');await page.locator('#prompt').fill('Prompt de validation');
    // The unsent preference follows the initial view only: configure this new view.
    await page.locator('#conversation-options-toggle').click();await page.locator('#settings-open').click();await page.getByText(/Contexte du modèle/).waitFor();await page.locator('#output-mode').selectOption('manual');await page.locator('#output-tokens').fill('777');await page.locator('#output-all-sessions').uncheck();await page.locator('#output-save').click();await page.getByText('Réglage prêt pour le premier envoi de cette conversation.').waitFor();await page.locator('#settings-close').click();
    await page.locator('#files-menu-toggle').click();await page.locator('#agent-images').check();await page.locator('#agent-images').press('Escape');await page.locator('#send').click();
    await page.locator('.message-truncated').waitFor();assert.equal(sends.length,1);assert.equal(sends[0].outputPreferences.maxOutputTokens,777);assert.equal(sends[0].outputPreferences.applyToAllSessions,false);assert.equal(sends[0].imageAccess,true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(captures)await page.screenshot({path:path.join(captures,width+'-v2-chat.png')});assert.deepEqual(errors,[]);
    if(width===320)await page.locator('#back').click();await page.locator('#new-chat').click();await page.locator('#prompt').fill('Autre conversation sans réglage');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('.message-truncated'));assert.equal(sends.length,2);assert.equal(sends[1].outputPreferences,undefined,'conversation-only preference must not leak into the next new chat');
    results.push({width,passed:true,comfyChecks:tests,sends:sends.length});await context.close();
  }
  console.log(JSON.stringify({mode:'synthetic browser',results,limitations:['Viewport simulé, pas un téléphone physique.','Transport modèle et ComfyUI simulés dans ce test.']},null,2));
}finally{await browser.close();}
