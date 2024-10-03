"use strict";(self.webpackChunktradingview=self.webpackChunktradingview||[]).push([[6124],{96445:(r,e,o)=>{o.r(e),o.d(e,{ChartStorageHttpLibrary:()=>d});var s=o(69798),t=o(59224),n=o(93544);var a=o(58844);const i=(0,t.getLogger)("Chart.SaveloadAdapter.Library"),c={sources:new Map,groups:new Map};function u(r,e,o){const s=new URL((0,a.getStorageURL)("drawings"));return e&&s.searchParams.append("chart",e),r&&s.searchParams.append("layout",r),o&&s.searchParams.append("symbol",o),s.toString()}class d{async saveLineToolsAndGroups(r,e,o,t){if(""===r||void 0===r)return Promise.reject("Unnamed chart cannot be saved");try{const n=function(r){const e={};return r.sources&&(e.sources={},r.sources.forEach(((r,o)=>{e.sources[o]=r}))),e.drawing_groups={},r.groups.forEach(((r,o)=>{e.drawing_groups[o]=r})),e.clientId=r.clientId,JSON.stringify(e)}(o),a=new FormData;a.append("state",n);const i=u(r,e),c=await(0,s.fetch)(i,{credentials:"same-origin",method:"POST",body:a});if(!c.ok)throw new Error(`Saving chart content response was not OK. Status: ${c.status}.`);const d=await c.json();if("ok"!==d.status)throw new Error("Saving chart content request failed: "+d.message);return{savedDto:o,layoutId:r,chartId:e,sharingMode:t,content:""}}catch(r){throw i.logWarn((0,n.errorToString)(r)),r}}async loadLineToolsAndGroups(r,e,o,t){if(""===r||void 0===r||"mainSeriesLineTools"!==o.requestType)return c;try{const o=u(r,e,t),n=await(0,s.fetch)(o,{credentials:"same-origin"});if(!n.ok)throw new Error(`Load LineTools And Groups response was not OK. Status: ${n.status}.`);const a=await n.json();if("ok"!==a.status)throw new Error("Load LineTools And Groups request failed: "+a.message);const i=JSON.parse(a.data.state||"{}");return function(r,e){const o={sources:null,groups:new Map};if(null!==r.sources){o.sources=new Map;for(const e in r.sources||{}){const s=r.sources[e];o.sources.set(e,s)}}for(const e in r.drawing_groups||{}){const s=r.drawing_groups[e];o.groups.set(e,s)}return null!==e&&(o.serverRequestId=e),o.clientId=r.clientId,o.symbol=r.symbol,o}(i,null)}catch(r){throw i.logWarn((0,n.errorToString)(r)),r}}async removeLineTools(r,e,o,s){throw new Error("Method not implemented.")}async getLayoutDrawingsSizeInfo(r,e){throw new Error("Method not implemented.")}async getUserGlobalDrawingsSizeInfo(r){throw new Error("Method not implemented.")}}}}]);