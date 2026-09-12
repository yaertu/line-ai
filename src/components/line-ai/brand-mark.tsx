export default function LineAiBrandMark({className}:{className?:string}) {
 return <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
  <defs>
   <linearGradient id="line-ai-bg" x1="8" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#22312F" /><stop offset="1" stopColor="#0D1316" /></linearGradient>
   <linearGradient id="line-ai-mint" x1="15" y1="15" x2="50" y2="52" gradientUnits="userSpaceOnUse"><stop stopColor="#B9F7D8" /><stop offset="1" stopColor="#63D9AA" /></linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#line-ai-bg)" />
  <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="17.25" stroke="#B9F7D8" strokeOpacity=".22" strokeWidth="1.5" />
  <path d="M18 17.5h26a7.5 7.5 0 0 1 7.5 7.5v13A7.5 7.5 0 0 1 44 45.5H30L20.5 53v-7.9A7.5 7.5 0 0 1 12.5 38V25a7.5 7.5 0 0 1 5.5-7.5Z" fill="#182320" stroke="url(#line-ai-mint)" strokeWidth="3" />
  <path d="M23 27h18M23 33h14M23 39h10" stroke="#F3FFF9" strokeWidth="3.2" strokeLinecap="round" />
  <path d="m45 14 1.1 2.9L49 18l-2.9 1.1L45 22l-1.1-2.9L41 18l2.9-1.1L45 14Z" fill="#B9F7D8" />
 </svg>;
}
