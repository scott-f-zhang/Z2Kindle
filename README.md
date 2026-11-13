# slides2kindle

把课件（PDF / PPTX）变成适合 Kindle 阅读的复习笔记：按章节生成的网页，加一本 EPUB 电子书。公式完整渲染，课件里的重点图会被裁出来，按版式排进正文。还可以再生成一个读起来像教材的"书本版"。

*Turn lecture slides (PDF/PPTX) into Kindle-friendly reading notes — per-chapter web pages and an EPUB with rendered formulas and laid-out slide figures, optionally rewritten as a flowing book. Deterministic steps are scripts; judgement steps (writing, figure selection, rewriting) are prompt templates run by Claude Code subagents.*

---

## 它是怎么工作的

流程分成两类工作：

- **固定步骤**由脚本完成，每次结果一样：提取、裁图、校验、构建。
- **需要判断的步骤**由提示词模板交给 Claude Code 子任务完成，结果需要人看一眼：写笔记、挑图、选版式、改写。

| 阶段 | 做什么 | 由谁完成 |
|---|---|---|
| 0 初始化 | 新建书籍项目和 `book.yaml` | `tools/init.py` |
| 1 提取 | 提取 PDF 文字，每页渲染成预览图（80 dpi）和高清图（220 dpi）；解包 PPTX，列出每页的图片 | `tools/extract.py`（poppler） |
| 2 写笔记 | 逐页看图，写成"阅读版"Markdown，公式转成 LaTeX | 子任务 + `prompts/summarize.md` |
| 3 配图 | 挑重点图，借助坐标网格裁剪，选择版式，写图注 | 子任务 + `prompts/figures.md` + `tools/figtool.py` |
| 3b 书本版（可选） | 改写成教材式的连贯章节，加章末小结和术语表 | 子任务 + `prompts/book.md` |
| 校验 | 检查图片路径、图号、引用、`:::` 和 `$$` 配对、裸 HTML 标签、繁体字、公式有没有丢 | `tools/check.py` |
| 4 网页 | Pandoc 转 HTML，KaTeX 预先渲染公式（不需要 JavaScript，可离线） | `build/build_web.js` |
| 5 EPUB | 公式经 MathJax 转 SVG 再转 PNG（按 em 定尺寸），Pandoc 生成 EPUB3，自动生成封面 | `build/build_epub.js` |

**为什么 EPUB 里的公式是图片**：Kindle 转换 EPUB 时对 MathML 和 KaTeX 的支持都不稳定，图片最可靠。图片按 em 定尺寸，会跟着阅读器的字号一起缩放。

## 安装

需要先装好：

- **poppler**：提供 `pdftotext` 和 `pdftoppm`。
- **pandoc 2.x**：用 2.16 测试过；3.x 改了图片的处理方式，能用，但要检查输出。
- **Node 18+** 和 **Python 3.9+**。

```bash
brew install poppler pandoc        # macOS；Linux 用对应的包管理器
```

```bash
make deps                          # npm install + pip install -r requirements.txt
```

```bash
make demo                          # 用自带的示例跑一遍完整流程
```

示例的输出在 `examples/demo/dist/`：打开 `web/index.html` 看网页，`book.epub` 是电子书。

## 做一本新书

```bash
python3 -I tools/init.py ~/books/ml-final --title "机器学习 · 复习笔记" --device scribe-11
```

```bash
cp ~/Downloads/lectures/*.pdf ~/books/ml-final/sources/
```

```bash
python3 -I tools/extract.py ~/books/ml-final
```

接下来是需要判断的步骤，最方便的做法是在 Claude Code 里用自带的 skill：

```bash
ln -s "$PWD/skill/slides2kindle" ~/.claude/skills/slides2kindle
```

然后在 Claude Code 里说"用 slides2kindle 把 ~/books/ml-final 做成 Kindle 笔记"。skill 会按阶段派子任务，并在每一步之后跑校验。

你也可以手动来：把 `prompts/*.md` 里的 `{PROJECT}`、`{TOOLKIT}`、`{CHAPTERS}` 等占位符替换掉，交给任意能看图的模型。

```bash
make check P=~/books/ml-final
```

```bash
make web epub P=~/books/ml-final
```

生成的 EPUB 要通过 **Send to Kindle**（网页、邮件或桌面应用）发到设备上。直接用 USB 拷贝 EPUB 到 Kindle 不行。

## 项目结构

```
<project>/
  book.yaml            书名、语言、设备、目录、封面、输出位置
  sources/             课件 .pdf / .pptx
  work/                提取结果：text/、img/、hires/、pptx/、grid/、manifest.json、epub-*/
  notes/<stem>.md      每章一个 Markdown 文件（唯一源文件）
  figs/<stem>/*.png    裁好的图
  front/preface.md     前言（可选）
  dist/                web/ 和 book.epub
```

想给同一个项目生成另一个版本（比如书本版），就再建一份配置，例如 `book-edition.yaml`，其中 `notes: notes_book`，并指定另外的输出位置。所有工具都可以直接接收这份 yaml 的路径，参考 `examples/demo/book-edition.yaml`。

## 笔记格式

- **公式**：行内 `$…$`，独立公式单独成段 `$$…$$`，只用 KaTeX 支持的命令。
- **图**：用 fenced div 包住只含图片的段落，图注就是图片的 alt 文字：

  ```markdown
  ::: {.fig .half}
  ![图 3-2　说明……](figs/L3_xxx/name.png)
  :::
  ```

  | 版式 | 适用场景 |
  |---|---|
  | `.full` | 整行宽度：结构图、流程图、数值例子 |
  | `.half` | 居中，约 64% 宽：中等复杂度、偏方形的图 |
  | `.side` | 浮在右侧，文字环绕：小图，后面跟着较长的正文 |
  | `.pair` | 两张图左右并排对照 |

- **提示框（书本版）**：`::: {.aside}` 是"延伸"框，放超出课件范围的补充；`::: {.note}` 是"注意"框，放课件里的笔误或存疑之处。
- **尖括号记号**（比如 `<s>`）要放进反引号，否则会被当成 HTML 标签。

## 设备参数

`profiles/devices.yaml` 定义了以下设备：Kindle Scribe 11″ / 10.2″、Paperwhite 7″ / 6.8″、Kindle 6″、Colorsoft。每个设备的参数包括：

- **屏幕分辨率**：决定封面的尺寸。
- **公式像素密度**（`px_per_em`）：决定公式图片的清晰度。
- **图片最大宽度**（`figure_max_width`）：裁出来的图超过这个宽度会被缩小。

要支持新设备，加一项即可。

## 注意事项

- **成本**：阶段 2、3、3b 都要逐页看图。参考一次实际使用：13 讲、约 230 页课件，三个阶段合计用了两百多万子任务 token。处理大批课件前，先估一下时间和费用。
- **版权**：课件和由它生成的笔记属于原作者。不要把它们提交到公开仓库，可以分享的是工具本身。
- **人工复核**：子任务写出来的内容可能有误。`check.py` 只检查结构问题，内容是否准确需要人来看。网页版可以在桌面浏览器里预览，EPUB 最终的效果要在真机上确认。
- **PPTX 的限制**：PPT 里用形状拼出来的图（不是图片文件）没法裁剪。
- **Pandoc 3.x**：会给出警告，因为图片的处理方式变了，需要检查输出。

## 许可证

MIT（见 `LICENSE`）。依赖的许可证：KaTeX（MIT）、MathJax（Apache-2.0）、resvg-js（MPL-2.0）、Pandoc（GPL，作为外部命令调用）、poppler（GPL，作为外部命令调用）。
