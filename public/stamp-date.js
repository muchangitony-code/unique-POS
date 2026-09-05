(function(){'use strict';
  function realDate(){
    var d=new Date();
    return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase();
  }
  window.UniquePOSStampDate={current:realDate,stampUrl:'/company-stamp.jpeg'};
  function decorate(img){
    if(!img||img.dataset.uniqueStampDate==='1')return;
    var src=img.getAttribute('src')||'';
    if(src.indexOf('company-stamp.jpeg')===-1)return;
    var parent=img.parentElement;if(!parent)return;
    img.dataset.uniqueStampDate='1';
    var wrap=document.createElement('span');
    wrap.style.cssText='position:relative;display:inline-block;line-height:0;vertical-align:middle;';
    parent.insertBefore(wrap,img);wrap.appendChild(img);
    var date=document.createElement('span');date.textContent=realDate();
    date.setAttribute('data-unique-stamp-date','1');
    date.style.cssText='position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);font-family:Arial,sans-serif;font-size:clamp(9px,4.2vw,22px);font-weight:700;letter-spacing:1px;color:#c11f2f;white-space:nowrap;line-height:1;pointer-events:none;text-align:center;';
    wrap.appendChild(date);
  }
  function scan(root){(root||document).querySelectorAll('img').forEach(decorate);}
  var observer=new MutationObserver(function(){scan(document);});
  function start(){scan(document);observer.observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
