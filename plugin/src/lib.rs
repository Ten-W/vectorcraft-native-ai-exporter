// SPDX-License-Identifier: GPL-2.0-or-later
mod native;
use base64::{engine::general_purpose::STANDARD,Engine};
use serde_json::{json,Value};

const MANIFEST:&str=r#"{"id":"tenw.native-ai","name":"可编辑 Illustrator AI（实验版）","version":"0.4.5-beta.1","kind":"exporter","author":"Ten-W","description":"保留文字、图层、分组、路径、PNG/JPEG/WebP 图片和动态箭头。字体自动匹配，直接导出，无需选择字体或填写参数。不支持的内容会明确提示并停止导出。","extensions":["ai"],"params":{}}"#;
fn keep(bytes:Vec<u8>)->i64{let len=bytes.len() as u64;let p=bytes.as_ptr() as u64;std::mem::forget(bytes);((len<<32)|p)as i64}
#[no_mangle]pub extern "C" fn vc_abi_version()->i32{1}
#[no_mangle]pub extern "C" fn vc_manifest()->i64{keep(MANIFEST.as_bytes().to_vec())}
#[no_mangle]pub extern "C" fn vc_alloc(size:u32)->u32{if size>128*1024*1024{return 0}let v=vec![0u8;size as usize];let p=v.as_ptr() as u32;std::mem::forget(v);p}
#[cfg(target_arch="wasm32")]
fn input(ptr:u32,len:u32)->Result<&'static[u8],String>{let end=(ptr as usize).checked_add(len as usize).ok_or("输入数据范围无效")?;if len>128*1024*1024||end>core::arch::wasm32::memory_size(0)*65536{return Err("输入数据范围无效或超过内存限制".into())}Ok(unsafe{std::slice::from_raw_parts(ptr as *const u8,len as usize)})}
#[cfg(not(target_arch="wasm32"))]
fn input(_:u32,_:u32)->Result<&'static[u8],String>{Err("此入口需要 WebAssembly 环境".into())}
#[no_mangle]pub extern "C" fn vc_run(ptr:u32,len:u32,params:u32,params_len:u32)->i64{
    let result=(||{let doc:Value=serde_json::from_slice(input(ptr,len)?).map_err(|_|"无法读取文档数据，请重新保存文档后再导出")?;let p:Value=serde_json::from_slice(input(params,params_len)?).map_err(|_|"无法读取导出设置，请重试")?;let raw=p["font_map"].as_str().unwrap_or("{}").trim();let map:Value=serde_json::from_str(if raw.is_empty(){"{}"}else{raw}).map_err(|_|"高级字体映射格式不正确，请使用 JSON 对象，或清空该设置后重试")?;native::write(&doc,&map)})();
    let output=match result{Ok(bytes)=>json!({"dataBase64":STANDARD.encode(bytes),"warnings":["此 AI 文件保留原生可编辑内容，但不含 PDF 预览，其他软件可能无法预览。文字未内嵌字体，在 Illustrator 编辑前请安装文档所用字体。"]}),Err(e)=>json!({"error":e})};
    keep(serde_json::to_vec(&output).unwrap_or_else(|_|"{\"error\":\"生成导出结果失败\"}".as_bytes().to_vec()))
}
