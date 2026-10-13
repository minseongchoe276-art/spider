import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';

// A real isolated PostgreSQL server with separate connections and roles.
// Only Supabase Auth identity and Realtime delivery are substituted locally.
export async function localGameDb({migrations=true}={}){
  const probe=net.createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'spider-postgres-'));
  const server=new EmbeddedPostgres({databaseDir:dir,user:'postgres',password:randomUUID(),
    port,persistent:false,authMethod:'scram-sha-256',
    postgresFlags:['-c','listen_addresses=127.0.0.1'],onLog(){},onError(){}});
  const connections=[];
  try{
    await server.initialise();await server.start();
    const admin=server.getPgClient('postgres','127.0.0.1');await admin.connect();connections.push(admin);
    await admin.query(`
      create role anon nologin;create role authenticated nologin;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;
      create schema qa;create table qa.broadcasts(payload jsonb,event text,topic text,private boolean);
      create schema realtime;create table realtime.messages(extension text);
      alter table realtime.messages enable row level security;
      create function realtime.topic() returns text language sql stable as
        $$select current_setting('qa.topic',true)$$;
      create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void
        language sql as $$insert into qa.broadcasts values(payload,event,topic,private)$$;
    `);
    const applied=[];
    if(migrations)for(const name of (await fs.readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()){
      await admin.query(await fs.readFile(path.join('supabase/migrations',name),'utf8'));applied.push(name);
    }
    async function actor(id=randomUUID()){
      await admin.query('insert into auth.users values($1)',[id]);
      const client=server.getPgClient('postgres','127.0.0.1');await client.connect();connections.push(client);
      await client.query('set role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
      return {id,client,async command(action,data={}){
        const result=await client.query('select public.game_command($1,$2::jsonb) as result',[action,JSON.stringify(data)]);
        return result.rows[0].result;
      }};
    }
    return {admin,actor,applied,async close(){
      await Promise.allSettled(connections.map(client=>client.end()));await server.stop();
    }};
  }catch(error){
    await Promise.allSettled(connections.map(client=>client.end()));
    await server.stop().catch(()=>{});throw error;
  }
}
