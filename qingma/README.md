# 青马工程报名表 · Carry Lattice 亮色点阵改版

基于用户提供的 `original.html` 做 **独立视觉增强**，不替换业务代码，不改变原有字段校验、记录条数、模板填充、照片处理、草稿导入导出或 DOCX 生成逻辑。

## 快速使用

**普通用户：** 下载单文件 `青马工程报名表填写工具-Carry Lattice.html`，直接双击在现代浏览器中使用。打开本目录的 `dist/index.html` 等价。**所有资源内联，无 CDN、无字体下载、无账号/服务器接口。**

**GitHub Pages：** 上传 `dist/index.html` 即可作为静态站点首页。

## 改版内容

- 亮色青绿纸感主背景、深松绿侧边栏、薄荷绿强调，所有动态粒子均为绿系；不使用上游默认黑/橙主题。
- 依照 Carry Lattice 的 **点集 → 映射 → 结晶** 动画语言：Hero 中用 850/390 个点的弹簧物理场，步骤切换时把点集依次映射为环、双螺旋、圆层、辐射、阵列、对勾。支持桌面鼠标扰动、按下粒子扩散。
- 使用上游的 `Dots` / `Clock` / `mountCanvas`、`mountDotText` 及真实 5×7 点阵字形、`mountProgress` 的晶化进度控件、`enhanceButton` 的原生按钮点阵光环，均来自随包 `vendor/carry-lattice` 适配源码；组合页的颜色、布局与 hero 编排为本次新增。
- 移动端导航滑动、表单聚焦反馈、动态卡片、原生日期选择、按钮悬停/按下状态、真实 `aria` 标签与减弱动态模式。
- 保留文档格式检验/草稿/照片/下载的原有事件；没有另设提交逻辑或二次绑定业务回调。

## 文件结构

```text
original.html                  # 上传的原始单文件（原样保留）
lattice-theme.css              # 亮色配色、布局与控件视觉覆盖层
lattice-behavior.js            # 纯表现层：粒子场、导航、进度、观察器和生命周期
lattice-enhancement.generated.js # 从随包真实 Carry Lattice 源码提取合成的离线脚本
build_lattice.py               # 构建脚本；保留业务脚本，更新内联 CSP SHA-256
dist/index.html                # 分发成品 / GitHub Pages 入口
vendor/carry-lattice/         # 按 skill copy_assets.py 复制的官方适配快照与 MIT 许可
preview-desktop.png, preview-mobile.png  # 测试截图
```

重新生成：

```bash
python build_lattice.py
```

**技术说明：** 保留原有 `6` 段 `<script>` 字符串完全不变，仅追加一段视觉脚本及一份 CSS 覆盖层（内嵌在原有 `<style>` 之后）。额外 HTML 节点只用于 canvas、进度读数与装饰；没有修改原始输入/事件模型或 Word 模板。CSP 重新计算所有内联 SHA-256，`connect-src 'none'` 不变。

## 验证范围

- 浏览器 Playwright/Chromium 1600×980、1120×900、390×844：无脚本报错、无横向溢出，生成截图检查。
- 已对比原版和改版内嵌 6 段业务脚本：**逐字节相同**。
- 同一份合法表单数据在原版/改版提交：**下载 DOCX 的 ZIP 包所有内部条目完全一致**（包含 `word/document.xml`、表格、样式、照片和关系）。JSON 草稿恢复与导出正常。
- 点击只触发原业务一次、简历最多 3 项、出生年月等原生输入控件、进度条与数据一致、照片显示与移除、末步隐藏“下一步”均有验证。
- 已测试 `prefers-reduced-motion: reduce` 和主动销毁后共享动画时钟订阅恢复 0。
- **未在实体 iPhone/Safari 或 GPU 加速设备上测试。** 粒子采用 Canvas 2D；在 WebGL 不可用时亦可工作。最终 Word/WPS 排版仍需由使用者检查。

## 许可与版权

Carry Lattice 来源：`carry-yu-0239/carry-design` 提交 `7a424c93b9be13cf835b91ea67495fec2ec0584e`，作者 `DayDreamInAReverie`，MIT。参见 `vendor/carry-lattice/LICENSE`，成品 HTML 中也完整嵌入该 MIT 许可。原文件和第三方 JSZip 等依赖按照原版权声明保留。项目视觉适配代码与上游组件快照分开存放。
