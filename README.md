# Editable Illustrator AI exporter for VectorCraft

This public snapshot contains the experimental standalone exporter and VectorCraft WASM plug-in, corresponding to v0.4.5-beta.1. It writes native Illustrator editing records without launching Illustrator. Tested on Illustrator 30.0.0 with synthetic files, including editable two-column Area Type. It has no PDF preview and does not claim full Illustrator compatibility.

- [WASM build and tests](plugin/README.md)
- [Synthetic Illustrator acceptance report](test/illustrator30-extended-0.4.5.json)
- [Third-party notices and GPL-2.0-or-later components](THIRD_PARTY.md)

各项实现、验收结果及宿主限制见 [ROADMAP.md](ROADMAP.md)。

本版新增单条闭合路径的原生内侧/外侧实色描边，锚点保持原位、线宽与对齐仍可编辑。暂不支持内外描边与箭头叠加、复合子路径。

# VectorCraft → Illustrator 原生 AI

> **0.4.5-beta.1 实验版**：已在 VectorCraft 0.21.0、Illustrator 30.0.0 用合成文件验证。尚未承诺任意作品无损或其他 Illustrator 版本兼容。

本版修复对象锁定/隐藏状态串联，补齐普通描边端点、转角、虚线和偏移；PNG/JPEG/WebP 已在 Illustrator 30.0.0 验证嵌入、编辑及保存重开。普通导出仍不弹字体参数框；插件预检九款已知字体的缺字。

本版修复曲线路径及旋转椭圆渐变的位置和色差。新增透明色标、线性渐变描边、多行多列与内边距、竖排、字符旋转、闭合/部分路径文字、图层透明度、复合裁切及文字/灰度图片/嵌套透明蒙版。普通实色多重外观可组合内外描边或开放路径箭头；竖线箭头不再与线条脱节。验证报告见 [Illustrator 30.0.0 扩展验收](test/illustrator30-extended-0.4.5.json)。

渐变仍限基础线性/径向填色、居中实线的线性渐变描边。多重渐变外观、自由渐变、径向/沿线/跨线渐变描边、复杂实时效果、非顶部对齐/自动适配/绕排文字、彩色图片蒙版、图层裁切及更多箭头预设仍会明确拒绝。支持范围见 [ROADMAP.md](ROADMAP.md)。

## 在 VectorCraft 内导出

下载 Release 的 **VectorCraft-Native-AI.wasm**，在 VectorCraft 通过 **Object › Plug-ins › Install Plug-in…** 安装，或用 File › Open 打开这个文件。

之后在 **File › Export › Export As** 选择 **可编辑 Illustrator AI（实验版）**。请选择这个新增格式；内置的 Adobe Illustrator 格式仍是 VectorCraft 自己的导出器。

字体自动匹配内置名称表（包括 Source Sans 3、Inter、微软雅黑、宋体等）。普通导出不再显示字体设置窗口，直接导出；特殊字体映射仅通过独立入口的 JSON 文件指定。插件沙箱不能扫描本机字体目录；未收录字体会用中文提示，字体仍需安装在 Illustrator 所在电脑上。

导出器不调用 Illustrator、Node.js 或其他程序。中文/英文点文字、字号、位置、多画板、图层、嵌套分组、基本路径、PNG 透明图片、九种基本动态箭头已经通过实际 Illustrator 编辑、另存和重开。符号由我们自行生成，不附带 Adobe 预设；箭头仅支持开口、无填充路径及 Tip 对齐。

**大图导出**：已验证的原版宿主 0.21.0 会省略达到 8 KiB 的嵌入图片字节。可使用下面的独立入口，或使用基于 v0.21.1 的 Windows 宿主修补版。修补版已在桌面及 CLI 导出 2048×2048 合成 PNG，RGBA 与源图逐字节一致。[宿主补丁和验收记录](integration/README.md)。

## 含大图片：独立导出

下载源码和 Release 的 **VectorCraft-Native-AI.wasm**，将 WASM 放在源码根目录，与脚本和 native 文件夹放在一起。双击 **Run-Independent.cmd** 选择已保存的 .vectorcraft 文件，也可以把文件拖到它上面。

需要 Node.js 22.18+；不需要安装或运行 Illustrator、VectorCraft。此入口运行同一个 .wasm 写入器，能够读取源文件附带的完整图片数据，也支持压缩的 VectorCraft 文件，不受宿主丢失图片字节的限制。仅在新路径生成文件，不覆盖原文件。独立入口会扫描本机字体、文档旁 Fonts 文件夹和 Windows 注册字体，匹配真实内部名称并检查缺字；额外字体目录可由 NATIVE_AI_FONTS_DIR 指定。扫描不会安装或修改系统字体。

命令行：

```powershell
node export-native.mjs 'D:/design/source.vectorcraft' 'D:/design/new.ai'
# 字体不能明确映射时会停止；第三个参数可指定 {"字体族|样式":"PostScriptFontName"} JSON 文件。
node export-native.mjs 'D:/design/source.vectorcraft' 'D:/design/new.ai' 'D:/design/font-map.json'
```

这两条新入口生成 **包含原生编辑数据、但不附带 PDF 预览的 AI 文件**，不是 PDF 改后缀。Illustrator 可以编辑；其他软件或文件管理器可能无法预览。超出已验证范围的复杂渐变、蒙版、特效、文字排版、其他图片格式及未映射字体会明确拒绝，不自动转曲、展开或丢弃。

验证报告保存在 test/illustrator30-*.json。基础字符/段落默认值适配自 PROOF，相关模块与组合发行遵循 GPL-2.0-or-later，见 [THIRD_PARTY.md](THIRD_PARTY.md) 和 LICENSES/GPL-2.0.txt。

## 早期 Node/PDF 实验入口

independent-export.mjs 仍保留为研究工具：读取 .vectorcraft 写入原生编辑数据，并调用 VectorCraft CLI 生成 PDF 预览后封装。导出时不调用 Illustrator，但它需要 CLI 和 npm 依赖。命令行仍保留 --experimental 门槛。优先使用上面的已打包 .wasm 或独立入口；此工具不是安装到 VectorCraft 的插件。

## 已验证的 Illustrator 重建工具

双击 `Run-Convert.cmd`，选择已保存的 `.vectorcraft` 文件即可。也可以把文件拖到 `Run-Convert.cmd` 上。

脚本会在输入文件旁生成带时间戳的新 AI 文件，不覆盖原文件。全部脚本文件必须放在同一文件夹。

这不是改扩展名或导出 PDF：脚本读取 VectorCraft 对象，在本机 Illustrator 中重建后，由 Illustrator 自己保存原生 AI。

## 环境

- Windows、Node.js、VectorCraft 自带的 vectorcraft-cli.exe。
- 已安装、可通过 COM 调用的 Illustrator。本机实际使用 Illustrator 2022（26.0.0）验证。绿色便携版如果没有注册 COM 接口，脚本可能无法连接该版本。
- 脚本不会修改注册表，也不会修改当前打开的其他文档。
- 请先在 VectorCraft 保存修改。脚本读取磁盘上的文件，不读取未保存的画布。

## 当前范围

旧版脚本的验证范围：多画板、图层、嵌套分组、贝塞尔路径、实色填充/描边、点文字及不同字符样式、产品图片。

- 文字由 Illustrator 原生文字对象重建，包含字体、字号、字重、颜色、行距和位置。
- 产品图片仍然是位图；源文件的图片透明蒙版合并到 PNG 的透明通道，再嵌入 AI。
- v3 保留真正的动态端点：线条仍为描边路径，箭头和圆点通过 Illustrator 临时动作写入描边面板的原生起点/终点箭头属性，不展开成轮廓。改线宽、端点、箭头样式及箭头缩放后可继续编辑。原 `.vectorcraft` 不修改。
- 当前映射 Triangle → Illustrator 箭头 7，Circle → 箭头 21；运行时测量该版本 Illustrator 的箭头大小并校准缩放。使用 Illustrator 标准形状，三角形长宽比例可能与 VectorCraft 略有区别。源文件中已经丢失且没有属性记录的标记无法自动找回。其他箭头种类会明确报错。
- 原生箭头动作支持简体中文和英文 Illustrator，实际测试环境为简体中文 Illustrator 2022。动作执行后自动卸载，不永久安装动作或更改箭头库。
- 不支持的字体会报错，不会默默换字体。已处理本次阿里巴巴普惠体及微软雅黑的字体别名。
- 不支持的对象类型会报错。当前不支持通用渐变、多重外观、矢量不透明蒙版、复杂裁切组、区域文字/路径文字、完整特效转换。
- 源文件中已经是路径轮廓或位图的字，不会恢复成文字。
- 保留的是输入 `.vectorcraft` 的分组结构，不能恢复最初导入时已经丢失的 Illustrator 结构。
- 这是针对本文件实现并测试的转换器，不是任意 VectorCraft 文件的无损通用转换器。

## 验证

保存后脚本会关闭并重新打开刚生成的 AI，对比画板数、图层数、分组数、路径数和文字内容，并在文字副本上测试修改后移除副本，移动/还原一处文字对象。对圆点和三角箭头，分别测试线宽加倍后端点标记随之加倍、移动路径端点后恢复。

同目录下生成 `.report.json` 检查报告和 `.preview.png` 第一页预览。`.vc-ai-*` 目录保存中间图片和可手动运行的 `convert.jsx`，排查错误时可查看；成功 AI 中图片已嵌入，不依赖该目录。

也可以指定路径运行：

```powershell
.\Convert-VectorCraft.ps1 -Source 'D:\design\sample.vectorcraft' -Destination 'D:\design\sample_native.ai'
```

输出路径已存在时拒绝覆盖；换一个名称即可。

## 旧版重建脚本能否安装进 VectorCraft

本节仅指 0.3.0 的 Run-Convert.cmd 旧路线；0.4.0 插件见文首。旧脚本是外部 Windows 转换工具，不能直接通过 VectorCraft 的“安装插件”加载。VectorCraft 插件是 WebAssembly 沙箱模块，不能访问文件系统、启动进程或调用 Illustrator COM。

可以另行开发“VectorCraft 菜单导出中间文件 + 外部桥接器完成转换”的集成；当前包尚未包含该桥接插件，也不会修改 VectorCraft 安装目录。

## 原生箭头实现资料

Illustrator 脚本 DOM 不提供箭头属性，本实现通过临时 `ai_plugin_setStroke` 动作设置，使用公开的动作参数格式信息：

- https://github.com/swwwitch/illustrator-scripts/blob/master/jsx/stroke-table/AiConnectorBuilder.jsx
- https://helpx.adobe.com/illustrator/desktop/paint-and-fill/apply-and-edit-strokes/add-arrowheads-to-strokes.html
