import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const workflow=JSON.parse(await readFile(new URL('../github-lead-sniper.json',import.meta.url),'utf8'));
const node=id=>workflow.nodes.find(n=>n.id===id);
export function execute(id,input,state,linked={}) {
 const lookup=name=>({first:()=>({json:linked[name]?.[0]}),itemMatching:index=>({json:linked[name]?.[index]})});
 return new Function('$input','$getWorkflowStaticData','$',node(id).parameters.jsCode)({all:()=>input.map(json=>({json})),first:()=>({json:input[0]})},()=>state,lookup);
}
const event=(login,day)=>({login,starred_at:`2026-01-0${day}T00:00:00Z`,owner:'example',repo:'test'});
const profile=(login,followers=100,public_repos=50)=>({login,followers,public_repos});
const batch=()=>({events:[event('low',2),event('high',3)],profiles:[{...event('low',2),profile:profile('low')},{...event('high',3),profile:profile('high',101,0)}]});
test('exported code compiles and all connections reference existing nodes',()=>{
 const names=new Set(workflow.nodes.map(n=>n.name));
 for(const n of workflow.nodes.filter(n=>n.type==='n8n-nodes-base.code'))new Function(n.parameters.jsCode);
 for(const [source,outputs] of Object.entries(workflow.connections)){assert.ok(names.has(source));for(const links of Object.values(outputs).flat())for(const link of links)assert.ok(names.has(link.node));}
 for(const id of ['stars','profile']){assert.equal(node(id).parameters.options.response.response.neverError,true);assert.equal(node(id).onError,'continueRegularOutput');}
 assert.equal(node('notify').onError,'stopWorkflow');
});
test('empty poll returns no profiles and preserves the baseline',()=>{
 const state={};const config={owner:'example',repo:'test',initial_checkpoint:'2026-01-01T00:00:00Z'};
 execute('state',[config],state);
 assert.equal(state.checkpoint,'2026-01-01T00:00:00.000Z');
 assert.deepEqual(execute('rate',[{body:[],statusCode:200}],state,{'Load checkpoint':[config]}),[]);
});
test('star pages deduplicate and sort into a complete profile batch',()=>{
 const star=(login,day)=>({user:{login},starred_at:event(login,day).starred_at});
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:['known:2026-01-02T00:00:00Z']};
 const linked={'Load checkpoint':[{owner:'example',repo:'test'}]};
 const [result]=execute('rate',[{body:[star('late',3)]},{body:[star('early',2),star('late',3),star('known',2)]}],state,linked);
 assert.deepEqual(result.json.events.map(e=>e.login),['early','late']);
 assert.throws(()=>execute('rate',[{body:{},statusCode:403}],state,linked),/checkpoint unchanged/);
});
test('exact qualification boundaries preserve all processed events for final commit',()=>{
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:[]};const result=execute('qualify',[batch()],state);
 assert.equal(result.length,1);assert.equal(result[0].json.login,'high');assert.equal(result[0].json.processed_events.length,2);
 assert.equal(state.checkpoint,'2026-01-01T00:00:00Z');
});
test('all nonqualifying profiles advance checkpoint and dedupe on next poll',()=>{
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:[]};const b=batch();b.profiles[1].profile.followers=100;
 assert.deepEqual(execute('qualify',[b],state),[]);assert.equal(state.checkpoint,event('high',3).starred_at);assert.equal(state.seen.length,2);
 const stars=b.events.map(e=>({user:{login:e.login},starred_at:e.starred_at}));
 assert.deepEqual(execute('rate',[{body:stars}],state,{'Load checkpoint':[{}]}),[]);
});
test('mixed batch commits low and high events only after all Slack responses confirm',()=>{
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:[]};const leads=execute('qualify',[batch()],state).map(x=>x.json);const linked={'Validate pitch and format Slack notification':leads};
 assert.throws(()=>execute('checkpoint',[{ok:false,error:'invalid_auth'}],state,linked),/checkpoint unchanged/);
 assert.deepEqual(state.seen,[]);execute('checkpoint',[{ok:true}],state,linked);
 assert.equal(state.checkpoint,event('high',3).starred_at);assert.equal(state.seen.length,2);
});
test('incomplete Slack batch never commits even if its responses succeeded',()=>{
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:[]};const b=batch();b.profiles[0].profile.followers=102;
 const leads=execute('qualify',[b],state).map(x=>x.json);
 assert.throws(()=>execute('checkpoint',[{ok:true}],state,{'Validate pitch and format Slack notification':leads}),/Incomplete/);assert.deepEqual(state.seen,[]);
});
test('failed or incomplete profile enrichment preserves checkpoint',()=>{
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:[]};const b=batch();b.profiles.pop();
 assert.throws(()=>execute('qualify',[b],state),/Incomplete/);assert.equal(state.checkpoint,'2026-01-01T00:00:00Z');
});
test('simulated star notifications are explicitly labelled and have real line breaks',()=>{
 const b=batch();b.simulated=true;const leads=execute('qualify',[b],{}).map(x=>x.json);
 const [message]=execute('format',[{text:'A relevant open source conversation.'}],{}, {'Normalize and qualify enriched profile':leads});
 assert.match(message.json.text,/TEST ONLY - SIMULATED STAR EVENT/);assert.ok(message.json.text.includes('\n*Company:'));assert.ok(!message.json.text.includes('\\n'));
});

test('exported star retry controller leaves state unchanged through exhaustion',()=>{
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:[]};const original=structuredClone(state);
 let context={url:'https://api.github.com/repos/a/b/stargazers',pages:[],visited:[],attempt:0};
 for(let attempt=0;attempt<2;attempt++)context=execute('Stars-handle',[{statusCode:503}],state,{'Prepare star request':[context]})[0].json;
 assert.throws(()=>execute('Stars-handle',[{statusCode:503}],state,{'Prepare star request':[context]}),/checkpoint unchanged/);assert.deepEqual(state,original);
});
test('exported profile controller cannot commit on failed profile request',()=>{
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:[]};const original=structuredClone(state);
 const context={events:[event('one',2)],index:0,profiles:[],attempt:2,url:'https://api.github.com/users/one'};
 assert.throws(()=>execute('Profiles-handle',[{statusCode:429}],state,{'Prepare profile request':[context]}),/checkpoint unchanged/);assert.deepEqual(state,original);
});
test('separate simulated lead workflow has no schedule or production pinned data',async()=>{
 const demo=JSON.parse(await readFile(new URL('../demo/simulated-lead-test.json',import.meta.url),'utf8'));
 assert.ok(!demo.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'));assert.equal(demo.active,false);assert.equal(workflow.pinData,undefined);
 assert.match(demo.nodes.find(n=>n.id==='config').parameters.jsCode,/simulated:true/);
 assert.equal(demo.nodes.find(n=>n.id==='stars').type,'n8n-nodes-base.code');
 assert.equal(demo.nodes.find(n=>n.id==='profile').type,'n8n-nodes-base.httpRequest');
 assert.equal(demo.nodes.find(n=>n.id==='pitch').type,'@n8n/n8n-nodes-langchain.chainLlm');
 assert.equal(demo.nodes.find(n=>n.id==='notify').parameters.url,'https://slack.com/api/chat.postMessage');
});
import { runInNewContext } from 'node:vm';
test('exported pagination controller runs without Node URL globals, as in n8n',()=>{
 const context={url:'https://api.github.com/repos/a/b/stargazers?per_page=100',pages:[],visited:[],attempt:0};
 const response={statusCode:200,body:[],headers:{link:'<https://api.github.com/repos/a/b/stargazers?page=2>; rel="next"'}};
 const scope={$input:{first:()=>({json:response})},$:()=>({itemMatching:()=>({json:context})}),$getWorkflowStaticData:()=>({})};
 const result=runInNewContext('(function(){'+node('Stars-handle').parameters.jsCode+'})()',scope);
 assert.equal(result[0].json.action,'request');assert.equal(result[0].json.url,'https://api.github.com/repos/a/b/stargazers?page=2');
});
