import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execute = promisify(execFile);
// Cold PowerShell/Add-Type (and CIM for stop) has its own bounded overhead.
// This never increases the native termination wait or retries a process effect.
const helperStartupBudgetMs = 60000, nativeReadBudgetMs = 5000;
const fail = code => Object.assign(new Error(code), { code, status: 409, effectAttempted: false });
const valid = value => value && Number.isSafeInteger(value.pid) && value.pid > 0 && value.pid <= 0x7fffffff
  && typeof value.executable === 'string' && path.win32.isAbsolute(value.executable) && !/[\0\r\n]/.test(value.executable);
const environment = () => Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));

// Checks, termination and wait use ONE native handle. PID reuse after opening
// that handle cannot redirect termination to another process.
const nativeSource = String.raw`
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CanaeDesktop {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr h, out long creation, out long exit, out long kernel, out long user);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, uint flags, StringBuilder image, ref uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h, uint timeout);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static string[] Run(string action, uint pid, string expectedTime, string expectedImage, uint timeout) {
    IntPtr handle=OpenProcess(0x1000u|0x100000u|(action=="stop"?1u:0u),false,pid);
    if(handle==IntPtr.Zero) {
      int error=Marshal.GetLastWin32Error();
      return new string[]{error==87||error==1168?"stopped":"unknown","","","false"};
    }
    try {
      if(WaitForSingleObject(handle,0)==0) return new string[]{"stopped","","","false"};
      long creation,exit,kernel,user; uint size=32768; var image=new StringBuilder((int)size);
      if(!GetProcessTimes(handle,out creation,out exit,out kernel,out user)||!QueryFullProcessImageName(handle,0,image,ref size)) return new string[]{"unknown","","","false"};
      string born=DateTime.FromFileTimeUtc(creation).Ticks.ToString();
      if(!String.Equals(image.ToString(),expectedImage,StringComparison.OrdinalIgnoreCase)||action!="capture"&&born!=expectedTime) return new string[]{"identity_changed","","","false"};
      if(action!="stop") return new string[]{"running",born,image.ToString(),"false"};
      if(WaitForSingleObject(handle,0)==0) return new string[]{"stopped","","","false"};
      if(!TerminateProcess(handle,0)) return new string[]{WaitForSingleObject(handle,0)==0?"stopped":"unknown","","","true"};
      return new string[]{WaitForSingleObject(handle,timeout)==0?"stopped":"unknown","","","true"};
    } finally { CloseHandle(handle); }
  }
}`;
const script = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'\n${nativeSource}\n'@; $i=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:CANAE_DESKTOP_INTENT))|ConvertFrom-Json; if($i.action -eq 'stop' -and $i.apiPort -gt 0 -and @(Get-NetTCPConnection -ErrorAction Stop | Where-Object { $_.LocalPort -eq $i.apiPort -and $_.State -in @('Listen','Established','SynReceived','SynSent') }).Count -gt 0){ @{state='connections_active';effectAttempted=$false}|ConvertTo-Json -Compress; exit }; $r=[CanaeDesktop]::Run($i.action,[uint32]$i.pid,$i.createdAt,$i.executable,[uint32]$i.timeout); @{state=$r[0];createdAt=$r[1];executable=$r[2];effectAttempted=($r[3] -eq 'true')}|ConvertTo-Json -Compress`;

/** Only for receipts anchored to a Desktop child spawned by this companion. */
export function createBionicDesktopProcess({ execFileImpl=execute, platform=process.platform }={}) {
  async function run(action, identity, timeoutMs=15000, apiPort=0) {
    if(platform!=='win32'||!valid(identity)||action!=='capture'&&!/^\d{1,20}$/.test(identity.createdAt||''))throw fail('desktop_identity_unconfirmed');
    if(!Number.isFinite(timeoutMs)||timeoutMs<0)throw fail('desktop_timeout_invalid');
    if(!Number.isInteger(apiPort)||apiPort<0||apiPort>65535)throw fail('desktop_port_invalid');
    const timeout=Math.min(30000,Math.max(100,timeoutMs));
    const nativeTimeout=action==='stop'?timeout:0;
    const commandTimeout=helperStartupBudgetMs+(action==='stop'?nativeTimeout:nativeReadBudgetMs);
    const intent=Buffer.from(JSON.stringify({action,pid:identity.pid,createdAt:identity.createdAt||'',executable:identity.executable,timeout:nativeTimeout,apiPort})).toString('base64');
    let output,result;
    try {
      output=await execFileImpl('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,shell:false,timeout:commandTimeout,maxBuffer:4096,env:{...environment(),CANAE_DESKTOP_INTENT:intent}});
    }catch(error){
      const timedOut=error?.code==='ETIMEDOUT'||error?.killed===true&&error?.signal==='SIGTERM'&&error?.code==null;
      throw Object.assign(fail(timedOut?'desktop_helper_timeout':'desktop_helper_failed'),{effectAttempted:action==='stop'});
    }
    try{result=JSON.parse(output.stdout);}catch{throw Object.assign(fail('desktop_status_unconfirmed'),{effectAttempted:action==='stop'});}
    if(!result||typeof result!=='object'||Array.isArray(result))throw Object.assign(fail('desktop_status_unconfirmed'),{effectAttempted:action==='stop'});
    if(result.state==='identity_changed')throw fail('desktop_identity_changed');
    if(result.state==='connections_active')throw fail('desktop_connections_active');
    if(!['running','stopped','unknown'].includes(result.state))throw Object.assign(fail('desktop_status_unconfirmed'),{effectAttempted:action==='stop'});
    if(action==='capture') {
      if(result.state!=='running'||!/^\d{1,20}$/.test(result.createdAt||'')||typeof result.executable!=='string'||result.executable.toLowerCase()!==identity.executable.toLowerCase())throw fail('desktop_identity_unconfirmed');
      return {pid:identity.pid,createdAt:result.createdAt,executable:result.executable};
    }
    if(action==='stop'&&result.state!=='stopped')throw Object.assign(fail('desktop_termination_unconfirmed'),{effectAttempted:result.effectAttempted===true});
    return {state:result.state};
  }
  return {capture:identity=>run('capture',identity),inspect:identity=>run('inspect',identity),stop:(identity,options={})=>run('stop',identity,options.timeoutMs,options.apiPort)};
}
