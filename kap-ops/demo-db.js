import { DatabaseSync } from 'node:sqlite';

/** Throwaway in-memory adapter for the free preview only. Never use for real orders. */
export function createDemoPool(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const normalize=sql=>sql
    .replace(/number bigint GENERATED ALWAYS AS IDENTITY UNIQUE/g,'number INTEGER UNIQUE DEFAULT (abs(random() % 1000000))')
    .replace(/tags text\[\] NOT NULL DEFAULT '\{\}'::text\[\]/g,"tags TEXT NOT NULL DEFAULT '[]'")
    .replace(/::jsonb|::int\b|::text\[\]/g,'')
    .replace(/\buuid\b|\bjsonb\b|\btimestamptz\b/g,'TEXT')
    .replace(/\bnow\(\)/gi,'CURRENT_TIMESTAMP')
    .replace(/CURRENT_TIMESTAMP\s*\+\s*interval\s*'7 days'/gi,"datetime('now','+7 days')")
    .replace(/\bILIKE\b/gi,'LIKE')
    .replace(/\s+FOR UPDATE\b/gi,'')
    .replace(/row_to_json\(c\)/g,"json_object('id',c.id,'email',c.email,'first_name',c.first_name,'last_name',c.last_name,'phone',c.phone)")
    .replace(/\$(\d+)/g,'?$1');
  const query=async (original,params=[])=>{
    const sql=normalize(original);
    if(sql.includes('CREATE TABLE')){db.exec(sql);return {rows:[],rowCount:0}}
    const statement=db.prepare(sql);
    const reader=/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)||/\bRETURNING\b/i.test(sql);
    if(reader){
      const rows=statement.all(...params).map(row=>{
        if(typeof row.customer==='string'){try{row.customer=JSON.parse(row.customer)}catch{}}
        return row;
      });
      return {rows,rowCount:rows.length};
    }
    const result=statement.run(...params);return {rows:[],rowCount:result.changes};
  };
  return {query,connect:async()=>({query,release(){}}),close:()=>db.close()};
}
