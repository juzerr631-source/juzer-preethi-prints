/* Progressive enhancements only; no checkout or order logic. */
(function(){
 const targets=document.querySelectorAll('.editorial-reveal');
 if(!targets.length)return;
 if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){targets.forEach(el=>el.classList.add('is-visible'));return}
 const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}})},{threshold:.08});
 targets.forEach(el=>observer.observe(el));
})();
