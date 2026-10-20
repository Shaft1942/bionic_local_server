import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebTools, isPublicAddress, plainText } from '../lib/web-tools.mjs';

// Every network/DNS operation is injected. These tests never open a socket,
// including tests of explicitly configured local search engines.
const publicRecords = [{ address: '93.184.216.34', family: 4 }];
const page = (text = '<title>Example</title><p>Readable content</p>', headers = {}) => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, text });
function service(options = {}) {
  return createWebTools({ lookupImpl: async () => publicRecords, requestImpl: async () => page(), searchEndpoint: '', braveKey: '', ...options });
}
const errorStatus = status => error => error.status === status && typeof error.message === 'string';

test('public address classification excludes local, transition, reserved and documentation ranges', () => {
  for (const address of ['0.1.2.3','10.2.3.4','127.0.0.1','100.64.0.1','100.127.255.254','169.254.169.254','172.16.0.1','172.31.255.255','192.168.1.1','192.0.0.9','192.0.2.1','192.88.99.1','198.18.0.1','198.19.255.255','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:7f00:1','64:ff9b::7f00:1','fc00::1','fe80::1','2001::1','2001:2::1','2001:20::1','2001:1ff:ffff::1','2001:db8::1','2002:7f00::1','3fff::1','3fff:fff:ffff::1','ff02::1','2001:4860::1%eth0','garbage',null]) assert.equal(isPublicAddress(address), false, String(address));
  for (const address of ['1.1.1.1','8.8.8.8','93.184.216.34','100.128.0.1','169.253.1.1','172.15.255.255','172.32.0.1','192.0.8.1','192.2.1.1','198.17.255.255','198.20.0.1','2001:4860:4860::8888','2606:4700:4700::1111','2a00:1450::1','2001:200::1']) assert.equal(isPublicAddress(address), true, address);
});

test('URLs reject credentials, nonweb protocols, alternate ports and disguised private addresses before DNS', async () => {
  let lookups = 0, requests = 0;
  const web = service({ lookupImpl: async () => { lookups++; return publicRecords; }, requestImpl: async () => { requests++; return page(); } });
  for (const url of ['file:///etc/passwd','ftp://example.com/a','https://user:secret@example.com/','https://example.com:8443/','http://localhost/','http://LOCALHOST./','http://printer.local/','http://router.home.arpa/','http://pc.lan/','http://2130706433/','http://0177.0.0.1/','http://0x7f000001/','http://[::1]/','http://[::ffff:7f00:1]/']) await assert.rejects(web.read(url), errorStatus(403), url);
  for (const url of ['',null,{},'not a URL','https://example.com/'+'x'.repeat(3000),'https://example.com/'+'é'.repeat(600)]) await assert.rejects(web.read(url), errorStatus(400));
  assert.equal(lookups, 0); assert.equal(requests, 0);
});

test('mixed or malformed DNS responses fail closed without connecting', async () => {
  for (const records of [[],null,{},[null],[{address:'invalid',family:4}], [...publicRecords,{address:'127.0.0.1',family:4}], [...publicRecords,{address:'fe80::1',family:6}], Array.from({length:65},()=>publicRecords[0])]) {
    let requests = 0;
    await assert.rejects(service({lookupImpl:async()=>records,requestImpl:async()=>{requests++;return page();}}).read('https://example.com/'),errorStatus(403));
    assert.equal(requests, 0);
  }
});

test('the validated DNS address is pinned and its family is derived from the actual address', async () => {
  let lookups = 0;
  const web = service({ lookupImpl:async(host,options)=>{lookups++;assert.equal(host,'example.com');assert.deepEqual(options,{all:true,verbatim:true});return [{address:'2606:4700:4700::1111',family:4},...publicRecords];},requestImpl:async(url,options)=>{assert.equal(url.hostname,'example.com');assert.equal(options.address,'2606:4700:4700::1111');assert.equal(options.family,6);assert(options.signal instanceof AbortSignal);return page();} });
  assert.equal((await web.read('https://example.com/#fragment')).url,'https://example.com/'); assert.equal(lookups,1);
});

test('public literal IPs need no DNS lookup', async () => {
  const web=service({lookupImpl:async()=>{throw new Error('DNS must not be called');},requestImpl:async(url,options)=>{assert.equal(options.address,'2606:4700:4700::1111');assert.equal(options.family,6);return page();}});
  await web.read('https://[2606:4700:4700::1111]/');
});

test('redirects reevaluate every destination including same-host DNS rebinding', async () => {
  for(const location of ['http://127.0.0.1/','http://[::1]/','http://printer.local/']) {
    let requests=0;
    await assert.rejects(service({requestImpl:async()=>{requests++;return{status:302,headers:{location},text:''};}}).read('https://example.com/'),errorStatus(403));
    assert.equal(requests,1);
  }
  let lookups=0,requests=0;
  await assert.rejects(service({lookupImpl:async()=>++lookups===1?publicRecords:[{address:'192.168.1.1',family:4}],requestImpl:async()=>{requests++;return{status:302,headers:{location:'/next'},text:''};}}).read('https://example.com/'),errorStatus(403));
  assert.equal(lookups,2);assert.equal(requests,1);
});

test('redirect loops and malformed destinations have bounded clear failures', async () => {
  let requests=0;
  await assert.rejects(service({requestImpl:async()=>{requests++;return{status:302,headers:{location:'/again'},text:''};}}).read('https://example.com/'),errorStatus(502));
  assert.equal(requests,4);
  for(const headers of [{},{location:'http://['},{location:['https://example.com/']}]) await assert.rejects(service({requestImpl:async()=>({status:302,headers,text:''})}).read('https://example.com/'),errorStatus(502));
});

test('accepted redirects report the final source URL and never forward search credentials', async () => {
  const calls=[];
  const web=service({braveKey:'injected-test-only-key',requestImpl:async(url,options)=>{calls.push({url:url.href,headers:options.headers});return calls.length===1?{status:302,headers:{location:'https://other.example/search'},text:''}:page(JSON.stringify({web:{results:[{title:'Result',url:'https://example.com/'}]}}),{'content-type':'application/json'});}});
  const result=await web.search('test');assert.equal(result.provider,'Brave');assert.equal(calls[0].headers['X-Subscription-Token'],'injected-test-only-key');assert.equal(calls[1].headers,undefined);
  let request=0;
  const reader=service({requestImpl:async()=>++request===1?{status:301,headers:{Location:'https://final.example/page'},text:''}:page()});
  assert.equal((await reader.read('https://example.com/')).url,'https://final.example/page');
});

test('cancellation bounds a DNS implementation that ignores signals and prevents later connections', async () => {
  const controller=new AbortController();let resolveDns,requests=0;
  const web=service({lookupImpl:()=>new Promise(resolve=>{resolveDns=resolve;}),requestImpl:async()=>{requests++;return page();}});
  const pending=web.read('https://example.com/',{signal:controller.signal});await Promise.resolve();controller.abort();
  await assert.rejects(pending,errorStatus(499));resolveDns(publicRecords);await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);
});

test('cancellation also bounds a transport ignoring its signal; an already aborted request never begins', async () => {
  const controller=new AbortController();let requests=0;
  const web=service({requestImpl:async()=>{requests++;return new Promise(()=>{});}});
  const pending=web.read('https://example.com/',{signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(pending,errorStatus(499));assert.equal(requests,1);
  await assert.rejects(web.read('https://example.com/',{signal:controller.signal}),errorStatus(499));assert.equal(requests,1);
});

test('one fifteen-second deadline covers DNS, request and all redirects', async t => {
  const durations=[],controller=new AbortController(),signals=[];
  t.mock.method(AbortSignal,'timeout',duration=>{durations.push(duration);return controller.signal;});
  const web=service({requestImpl:async(url,options)=>{signals.push(options.signal);return signals.length===1?{status:302,headers:{location:'/next'},text:''}:new Promise(()=>{});}});
  const pending=web.read('https://example.com/');await new Promise(resolve=>setImmediate(resolve));controller.abort(new DOMException('test timeout','TimeoutError'));
  await assert.rejects(pending,errorStatus(504));assert.deepEqual(durations,[15000]);assert.equal(signals.length,2);assert.equal(signals[0],signals[1]);
});

test('DNS and transport failures are clear errors and do not leak implementation details', async () => {
  for(const options of [{lookupImpl:async()=>{throw new Error('private machine details');}},{requestImpl:async()=>{throw new Error('private machine details');}},{requestImpl:async()=>null}]) {
    await assert.rejects(service(options).read('https://example.com/'),error=>error.status===502&&!error.message.includes('private machine'));
  }
});

test('MIME type, encoding and response byte limits are enforced', async () => {
  for(const response of [page('image',{'content-type':'image/svg+xml'}),page('bytes',{'content-type':'application/octet-stream'}),page('bytes',{'content-type':''}),page('gzip',{'content-encoding':'gzip'})]) await assert.rejects(service({requestImpl:async()=>response}).read('https://example.com/'),errorStatus(415));
  for(const response of [page('x'.repeat(1500001)),page('é'.repeat(750001)),page('x',{'content-length':'1500001'}),page(Buffer.from('x'))]) await assert.rejects(service({requestImpl:async()=>response}).read('https://example.com/'),errorStatus(413));
  await assert.rejects(service({requestImpl:async()=>({status:403,headers:{},text:''})}).read('https://example.com/'),error=>error.status===502&&error.message.includes('403'));
  assert.equal((await service({requestImpl:async()=>page('hello',{'Content-Type':'text/plain'})}).read('https://example.com/')).text,'hello');
});

test('passive extraction removes active blocks, comments and control entities without fetching resources', () => {
  assert.equal(plainText('<p>A &amp; B &#x1f642;</p><script>secret()</script><style>bad</style><iframe src="http://127.0.0.1">hidden</iframe><svg><script>x</script></svg><!-- hidden --><img src="http://127.0.0.1" onerror="x"><p>C&#0;&#xD800;&#127;</p>'), 'A & B 🙂\nC');
  assert.equal(plainText('Text<script>never closes'),'Text');
  assert.equal(plainText('Text<!-- never closes'),'Text');
});

test('read returns bounded exact excerpts and targeted passage ranges', async () => {
  const content='A'.repeat(500)+'Needle'+'B'.repeat(6500),web=service({requestImpl:async()=>page(content,{'content-type':'text/plain'})});
  const excerpt=await web.read('https://example.com/',{start:20,length:40});assert.equal(excerpt.text,content.slice(20,60));assert.equal(excerpt.next,60);assert.equal(excerpt.totalCharacters,content.length);
  const targeted=await web.read('https://example.com/',{query:'needle',length:500});assert.equal(targeted.start,300);assert(targeted.text.includes('Needle'));assert.equal(targeted.text.length,500);
  assert.equal((await web.read('https://example.com/',{start:content.length+1})).next,null);
  await assert.rejects(web.read('https://example.com/',{query:'absent'}),errorStatus(404));
});

test('malformed large markup and unclosed result anchors stay bounded without recursive backtracking', async () => {
  const text='<'.repeat(300000)+'<title>'.repeat(30000);
  const result=await service({requestImpl:async()=>page(text)}).read('https://example.com/');
  assert.equal(result.text.length,4000);assert.equal(result.title,'Page web');
  await assert.rejects(service({requestImpl:async()=>page('<a class="result__a" href="https://example.com/">'.repeat(20000))}).search('test'),errorStatus(502));
});

test('invalid excerpt/search arguments are rejected before DNS or network work', async () => {
  let calls=0;const web=service({lookupImpl:async()=>{calls++;return publicRecords;}});
  for(const options of [{start:-1},{start:1.5},{start:Number.MAX_SAFE_INTEGER+1},{length:0},{length:6001},{length:'20'},{query:''},{query:42},{query:'a'.repeat(301)}]) await assert.rejects(web.read('https://example.com/',options),errorStatus(400));
  for(const query of ['',null,{},'  ','a'.repeat(501)]) await assert.rejects(web.search(query),errorStatus(400));
  assert.equal(calls,0);
});

test('DuckDuckGo parses real-shaped result links, strips markup and deduplicates sources', async () => {
  const html='<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2&amp;rut=x"><b>Example</b> &amp; source</a><a href="https://example.com/a?x=1&amp;y=2" class="result__a">Duplicate</a><a class="result__a" href="http://127.0.0.1/">Private</a><a class="result__a" href="/l/">Invalid redirect</a>';
  const web=service({requestImpl:async(url)=>{assert.equal(url.hostname,'html.duckduckgo.com');assert.equal(url.searchParams.get('q'),'search & words');return page(html);}});
  const result=await web.search('search & words');assert.equal(result.provider,'DuckDuckGo');assert.deepEqual(result.results,[{title:'Example & source',url:'https://example.com/a?x=1&y=2',snippet:''}]);assert.match(result.note,/externes non fiables/);
});

test('a DuckDuckGo bot challenge or unusable result is an explicit error, never an invented success', async () => {
  for(const html of ['<form>Prove you are human</form>','<a class="result__a" href="http://127.0.0.1/">Private only</a>']) await assert.rejects(service({requestImpl:async()=>page(html)}).search('test'),error=>error.status===502&&/vérification humaine/.test(error.message));
});

test('an explicitly configured SearXNG endpoint may be local but its results remain public only', async () => {
  let requests=0;
  const web=service({searchEndpoint:'http://127.0.0.1:8080/search',lookupImpl:async()=>{throw new Error('literal IP');},requestImpl:async(url,options)=>{requests++;assert.equal(options.address,'127.0.0.1');assert.equal(url.port,'8080');assert.equal(url.searchParams.get('format'),'json');assert.equal(url.searchParams.get('q'),'test');return page(JSON.stringify({results:[{title:'<b>Title</b>',url:'https://example.com/',content:'<p>Snippet</p>'},{url:'http://192.168.1.1/'},{url:'file:///private'}]}),{'content-type':'application/json'});}});
  const result=await web.search('test');assert.equal(result.provider,'SearXNG');assert.deepEqual(result.results,[{title:'Title',url:'https://example.com/',snippet:'Snippet'}]);assert.equal(requests,1);
  await assert.rejects(web.read('http://127.0.0.1:8080/search'),errorStatus(403));assert.equal(requests,1);
});

test('trusted search redirects are refused and endpoint configuration cannot contain credentials or query state', async () => {
  let requests=0;
  await assert.rejects(service({searchEndpoint:'http://search.local:8080/search',lookupImpl:async()=>[{address:'192.168.1.1',family:4}],requestImpl:async()=>{requests++;return{status:302,headers:{location:'http://other.local/'},text:''};}}).search('test'),errorStatus(502));assert.equal(requests,1);
  for(const endpoint of ['invalid','file:///private','https://user:secret@example.com/search','https://example.com/search?token=x','https://example.com/search#x']) assert.throws(()=>service({searchEndpoint:endpoint}),errorStatus(400));
});

test('malformed JSON or result schemas in SearXNG and Brave fail clearly', async () => {
  for(const config of [{searchEndpoint:'https://search.example/search'},{braveKey:'synthetic-key'}]) for(const text of ['<html>captcha</html>','null','{}','{"results":{}}','{"web":{"results":"bad"}}']) await assert.rejects(service({...config,requestImpl:async()=>page(text,{'content-type':'application/json'})}).search('test'),errorStatus(502));
});

test('search result counts, title and snippet sizes are bounded', async () => {
  const rows=Array.from({length:20},(_,index)=>({title:'T'.repeat(500),url:`https://example.com/${index}`,content:'S'.repeat(1000)}));
  const result=await service({searchEndpoint:'https://search.example/search',requestImpl:async()=>page(JSON.stringify({results:rows}),{'content-type':'application/json'})}).search('test');
  assert.equal(result.results.length,5);for(const item of result.results){assert.equal(item.title.length,220);assert.equal(item.snippet.length,400);}
});
