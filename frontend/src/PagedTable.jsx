import {Children,cloneElement,useState} from 'react';
export default function PagedTable({children,label='Table pagination'}) {
  const sections=Children.toArray(children.props.children),body=sections.find(c=>c.type==='tbody');
  const rows=Children.toArray(body?.props.children),signature=rows.map(r=>r.key).join('|');
  const [position,setPosition]=useState({signature:'',page:1});
  const totalPages=Math.max(1,Math.ceil(rows.length/10));
  const page=Math.min(totalPages,position.signature===signature?position.page:1),start=(page-1)*10;
  const table=cloneElement(children,{},sections.map(c=>c.type==='tbody'?cloneElement(c,{},rows.slice(start,start+10)):c));
  return <><div className="ws-table-wrap">{table}</div><nav className="ws-pagination" aria-label={label}><span>{rows.length?`${start+1}–${Math.min(start+10,rows.length)} of ${rows.length}`:'0 records'}</span><div><button type="button" disabled={page===1} onClick={()=>setPosition({signature,page:page-1})}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" disabled={page===totalPages} onClick={()=>setPosition({signature,page:page+1})}>Next</button></div></nav></>;
}
