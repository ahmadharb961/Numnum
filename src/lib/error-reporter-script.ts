// Runs first on every page (inline in <head>), so it is listening before React takes over the page.
// Reports up to 3 errors per page load to /api/client-error. For a hydration error (#418: the page
// the server sent differs from what the phone draws) it also sends the lines that differ, comparing
// the server's text (snapshot when the page finished loading, or fetched again) with the page now.
export const ERROR_REPORTER_SCRIPT = `(function(){
var n=0,ssr=null;
function snap(){if(ssr===null&&document.body&&document.readyState!=="loading")ssr=document.body.innerText}
document.addEventListener("readystatechange",snap);
function L(s){return String(s).split("\\n").map(function(x){return x.trim()}).filter(Boolean)}
function diff(server){var a=L(server),b=L(document.body.innerText),A=new Set(a),B=new Set(b);return{serverOnly:a.filter(function(x){return!B.has(x)}).slice(0,15),clientOnly:b.filter(function(x){return!A.has(x)}).slice(0,15)}}
function post(d){var s=JSON.stringify(d);if(!(navigator.sendBeacon&&navigator.sendBeacon("/api/client-error",new Blob([s],{type:"application/json"}))))fetch("/api/client-error",{method:"POST",body:s,headers:{"content-type":"application/json"},keepalive:true}).catch(function(){})}
function send(m,st){try{
 if(n>=3||!m||/ResizeObserver loop|^Script error|extension:\\/\\//.test(m))return;n++;
 var d={path:location.pathname+location.search,message:String(m).slice(0,300),stack:st?String(st).slice(0,1500):null,hydration:/#41[89]|#42[0-5]|ydrat/.test(m)};
 if(!d.hydration)return post(d);
 if(ssr!==null){var x=diff(ssr);d.serverOnly=x.serverOnly;d.clientOnly=x.clientOnly;return post(d)}
 fetch(location.href,{credentials:"include"}).then(function(r){return r.text()}).then(function(h){
  var t=h.replace(/<script[\\s\\S]*?<\\/script>/g," ").replace(/<style[\\s\\S]*?<\\/style>/g," ").replace(/<[^>]+>/g,"\\n").replace(/&amp;/g,"&").replace(/&#x27;/g,"'").replace(/&quot;/g,'"');
  var x=diff(t);d.serverOnly=x.serverOnly;d.clientOnly=x.clientOnly;post(d)}).catch(function(){post(d)});
}catch(e){}}
addEventListener("error",function(e){send(e.message||(e.error&&e.error.message),e.error&&e.error.stack)});
addEventListener("unhandledrejection",function(e){var r=e.reason;send(r&&r.message||String(r),r&&r.stack)});
})();`;
