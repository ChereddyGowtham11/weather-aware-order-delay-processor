import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDecision,advanceStarRequest,advanceProfileRequest,commitEvents} from '../lib/githubRecovery.mjs';
const now=Date.parse('2026-01-01T00:00:00Z');
for(const status of [429,500,502,503,504])test(`HTTP ${status} retries at most twice`,()=>{
 assert.equal(retryDecision({statusCode:status},0,now).attempt,1);assert.equal(retryDecision({statusCode:status},1,now).attempt,2);assert.throws(()=>retryDecision({statusCode:status},2,now),/checkpoint unchanged/);
});
for(const status of [400,401,403,404,422])test(`ordinary HTTP ${status} fails without retry`,()=>assert.throws(()=>retryDecision({statusCode:status},0,now),/checkpoint unchanged/));
test('network timeout retries and successful response completes',()=>{assert.equal(retryDecision({error:{message:'timeout'}},0).waitSeconds,1);assert.equal(retryDecision({statusCode:200},0).success,true);});
test('Retry-After seconds and dates plus primary reset are respected case-insensitively',()=>{
 assert.equal(retryDecision({statusCode:429,headers:{'Retry-After':'90'}},0,now).waitSeconds,90);
 assert.equal(retryDecision({statusCode:503,headers:{'retry-after':new Date(now+120000).toUTCString()}},0,now).waitSeconds,120);
 assert.equal(retryDecision({statusCode:403,headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':String(now/1000+180)}},0,now).waitSeconds,180);
 assert.equal(retryDecision({statusCode:403,body:{message:'secondary rate limit'}},0,now).waitSeconds,60);
});
test('long reset fails rather than retrying before server deadline',()=>assert.throws(()=>retryDecision({statusCode:429,headers:{'retry-after':'301'}},0,now),/300-second/));
test('invalid negative retry headers use fallback',()=>assert.equal(retryDecision({statusCode:503,headers:{'retry-after':'-1'}},1,now).waitSeconds,2));
test('star retries preserve prior pages and retry same URL',()=>{
 const c={url:'https://api.github.com/repos/a/b/stargazers?per_page=100',pages:[[{a:1}]],attempt:0,visited:[]};
 const next=advanceStarRequest(c,{statusCode:503},now);assert.equal(next.url,c.url);assert.deepEqual(next.pages,c.pages);assert.equal(next.action,'request');
 assert.throws(()=>advanceStarRequest({...c,attempt:2},{statusCode:503},now),/checkpoint unchanged/);
});
test('pagination accumulates pages, resets attempt and delays next page',()=>{
 const c={url:'https://api.github.com/repos/a/b/stargazers?per_page=100',pages:[],attempt:1,visited:[]};
 const next=advanceStarRequest(c,{statusCode:200,body:[1],headers:{link:'<https://api.github.com/repos/a/b/stargazers?page=2>; rel="next"'}},now);
 assert.equal(next.attempt,0);assert.equal(next.waitSeconds,1);
 assert.deepEqual(advanceStarRequest(next,{statusCode:200,body:[2]},now).body,[1,2]);
 assert.throws(()=>advanceStarRequest(c,{statusCode:200,body:[],headers:{link:'<https://evil.example/>; rel="next"'}},now),/Unsafe/);
});
test('profile failure cannot complete a partial batch and retries preserve pairing',()=>{
 const c={events:[{login:'one'},{login:'two'}],profiles:[],index:0,attempt:0,url:'https://api.github.com/users/one'};
 const next=advanceProfileRequest(c,{statusCode:200,body:{login:'one',followers:101,public_repos:2}},now);
 assert.equal(next.index,1);assert.equal(next.url,'https://api.github.com/users/two');assert.equal(next.profiles.length,1);
 assert.equal(advanceProfileRequest(next,{statusCode:503},now).index,1);
 assert.throws(()=>advanceProfileRequest({...next,attempt:2},{statusCode:503},now),/checkpoint unchanged/);
 assert.throws(()=>advanceProfileRequest(next,{statusCode:200,body:{login:'wrong',followers:1,public_repos:1}},now),/Invalid/);
});
test('commit validates entire batch before mutating state',()=>{
 const state={checkpoint:'2026-01-01T00:00:00Z',seen:[]};assert.throws(()=>commitEvents(state,[{login:'one',starred_at:'2026-01-02T00:00:00Z'},{login:'bad',starred_at:'invalid'}]),/checkpoint unchanged/);assert.deepEqual(state,{checkpoint:'2026-01-01T00:00:00Z',seen:[]});
});
