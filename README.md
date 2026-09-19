# EnglishLehrer

Windows 本地运行的儿童英语课堂。面向 8 岁、英语零基础的孩子：Mia 用德语讲解、英语示范，提供实时语音、教学白板和选择题。

## 一键启动

1. 安装 **Node.js 24 LTS 或更新版本**。
2. 使用已有 Windows 环境变量 **`openai_api_key`**，无需在网页输入密钥；Windows 上 `OPENAI_API_KEY` 同样可用。模型和声音可以在项目根目录的 **`.env`** 配置。
3. 双击 **`Start-EnglishLehrer.cmd`**。首次启动会安装依赖和构建界面，然后打开浏览器。
4. 在 **http://127.0.0.1:3210** 选择主题，点击 **Mikrofon an & Stunde starten**，允许 Chrome 使用麦克风。

启动入口会优先打开已安装的 Chrome；如果没有找到 Chrome，则使用默认浏览器，请在 Chrome 中访问上述地址。再次启动会复用现有本地服务。无需账号或登录。服务只监听本机 `127.0.0.1`。

环境变量在 Windows“编辑账户的环境变量”中设置；密钥只在服务端读取，不打印、不落盘，也不会发送给浏览器。启动脚本会尝试从现有进程、Windows 用户、系统环境依次读取 `openai_api_key`。

### 手动启动

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

在运行窗口按 `Ctrl+C` 可关闭服务，保存中断状态并清理语音会话。一键启动的服务在后台运行；关闭课堂页面会停止该语音会话，首页仍可随时再次打开。

## 已实现功能

- **可执行教案**：在 **Vorbereitung** 选择主题，再点 **Unterrichtsplan & Lernbelege → Plan erstellen**。AI 根据主题、已教内容和到期复习词生成具体步骤；可预览白板、上下移动步骤、修改练习方式、德语含义和预计时间，再点 **Plan speichern & Bilder vorbereiten**。时间仅供备课参考，绝不作为孩子的答题倒计时。调整后若把未教单词的测验放到示范之前，会提示修正并保留旧计划。
- **课前素材准备**：优先使用本地 emoji，图片练习缺少素材时在备课阶段生成并缓存插图，显示准备进度。失败的图片题明确回退到“德语→英语口说”，保存计划可重试；课堂不提问不可见图片。预览与预取不会产生学习记录。
- **更快的课堂衔接**：新课使用所选主题的已保存教案快照，在孩子回答时提前编译后续白板。点击结果可直接使用下一步；口头回答经过一次后台判断后执行已准备步骤，省去常规路径重新出题和工具结果后的文字改写。先确认白板已渲染再发出语音提示。临时请求、复杂回答、计划耗尽或收尾仍由完整教学规划处理。没有有效教案时保留原课堂流程。
- **按词、按能力复习**：学习进度和备课页分别显示“选择识别”和“独立口说”的证据与下次复习时间，不把选择题当成英语听力测评。跟读、未回答和不确定识别不提升独立掌握，也不推迟复习。默认按不同课堂中的连续独立成功采用 1、3、7、14、30 天间隔，错误或提示后成功缩短到一天；这是产品默认策略。新课开头安排最多三个到期词，缺少预备材料时由教学后台补充。备课调整不修改已开始课堂的快照和结果。

- 德语首页：自由选题、学习计划、基于本地练习表现的推荐、已学主题和完整课程历史。
- 七个起始主题：问候、颜色、数字、动物、家庭、常见物品、星期；每个主题都可反复学习。
- 首页 **Vorbereitung / Unterricht vorbereiten（备课与复盘）**：与后台 AI 用中文或德语聊天，创建新主题、给现有主题补词汇和句型、修改教学目标与安排，也可选一节历史课堂做课后总结。主题和备课聊天保存至本地数据库；修改结果会显示在聊天和右侧主题预览中。
- 备课页右上角 **Gespräch leeren** 可在确认后清空聊天，后续 AI 请求不再读取旧聊天；主题和学习结果保留。正在处理时按钮暂不可用。
- 备课输入框下方 **Spracheingabe**：点击开始录音，再点 **Stoppen** 转为文字并追加到草稿，检查后手动 **Senden**。默认自动识别中文、英语、德语（可手动选择）；中文 API 代码为 `zh`。可取消，单次最多 3 分钟，离开页面会释放麦克风。本地不保存录音，转写需要发送音频至 OpenAI。
- 可以让备课 AI 删除主题，例如“请删除 Hallo, Welt!”；它会显示 **Löschen bestätigen** 待确认按钮。也可使用每张主题卡片右上角的垃圾桶按钮。确认后主题从列表中移除，重启不会恢复，已有课堂记录仍可查看或继续。
- 已有主题保留稳定 ID 和学习记录，修改从下一节新课堂生效；进行中/中断的课堂保留原计划。新主题可直接从首页选中上课。AI 处理中途失败不会保存一半修改，重复发送同一请求不会重复创建主题。
- GPT-Live 1 WebRTC 实时听说、插话、静音与双方实时字幕。
- 课堂顶部 **Sprechtempo** 五档语速滑条（Sehr langsam → Schnell），选择保存在当前浏览器。连接中通过 Live 语音指令从下一句话调整，保留孩子的回答时间；属于模型语速偏好，不是精确音频倍速。
- 本地 **3,720 个 Twemoji SVG 素材**，支持英文/德文名称查询；bus、train、sofa 等显示大 emoji，基础色球仍精准绘制。无匹配 emoji 时显示 GPT Image 绘图等待提示，生成完成后再询问图片。
- 四种交替练习：跟读、听德语选英语、看图说英语、听德语说英语。口头题隐藏选择按钮和答案；跟读不计入独立掌握证据。
- 桌面课堂 60% 白底教学白板 + 40% 对话区；窄屏按上下排列。
- 课堂针对 FHD、150% 缩放适配：覆盖 1280×720 和扣除浏览器工具栏后的 1280×620 CSS 视口，常规教学、答题与控制按钮保留在首屏；长对话在右侧面板内滚动。
- GPT-5.6 Terra 通过受约束工具更新白板、添加/替换/移动/突出/删除文字及图形、出题、评估回答和生成总结。
- 支持后台在同一个白板工具调用中擦除旧内容并绘制新内容，保留已经保存的学习记录；跟读单词后也会触发下一步规划，不依赖当前是否显示选择题。
- 白板更新为一次事务和一次界面快照；浏览器确认渲染后，后台才确认画面更新。
- 同一题支持点击与语音回答、错误提示及重试；保留有效尝试、提示使用和不确定回答，拒绝迟到答案，合并短时间内同选项的点击/语音重复输入。
- 图片按需后台生成、缓存至本地；过期任务不会覆盖新的教学步骤，图片失败可继续文字教学。
- Emoji 素材及数据来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 约 9 分钟提醒模型收尾；模型准备总结后，前端检测实际麦克风/播放声音与字幕活动，连续安静 7 秒后结束。孩子继续说话会延后结束；也可随时点击结束。
- 关键结果及时保存 SQLite。断线可在同一课程中重连；完成、提前结束和中断分别记录。完成主题和掌握知识点分别判断。
- 等待回答或后台处理时不发送在场提醒，也不因沉默自动断开；手动结束、正常下课与实际断线后的资源清理照常处理。
- 总结失败仍保留全部已确认结果；离线也可查看学习历史。

## 数据与隐私

默认数据路径：

| 文件 | 内容 |
| --- | --- |
| `data/learning.sqlite` | 主题目录和版本、备课聊天、每课计划快照、学习档案、词句、题目、回答记录和事件去重依据 |
| `data/learning.sqlite-wal`、`data/learning.sqlite-shm` | SQLite 运行时辅助文件 |
| `data/images/*.png` | 可复用的教学插图 |
| `data/server.log`、`data/server-error.log` | 一键启动的简短服务日志，不包含密钥或逐字对话 |

**本地不保存录音、完整课堂逐字对话或模型内部推理。** 课堂字幕只在内存中。家长在备课页面主动输入的聊天、后台回复和主题修改结果会保存在本地，以便继续备课。声音、近期对话和必要的学习上下文发送至 OpenAI；备课也会发送相关主题、聊天及已有学习结果。Responses 和 Live 调用均设置 `store:false`；这不等同于修改 API 账号的服务端数据保留政策。

备份时先停止程序，再复制整个 `data` 目录。不要只在程序运行时复制主 SQLite 文件而漏掉 WAL 文件。

## 可选配置

模型和声音在项目根目录 `.env` 修改（可参考 `.env.example`）：

```dotenv
ENGLISH_LIVE_MODEL=gpt-live-1
ENGLISH_TEACHER_MODEL=gpt-5.6-terra
ENGLISH_IMAGE_MODEL=gpt-image-2.5-flare
ENGLISH_TRANSCRIPTION_MODEL=gpt-transcribe
ENGLISH_VOICE=marin
```

后台教学、备课聊天和课后总结统一使用 `ENGLISH_TEACHER_MODEL`。更换模型后，结束当前课堂并双击 **`Restart-EnglishLehrer.cmd`**，再刷新网页。普通启动入口会复用已有服务，所以仅再次双击 Start 不会加载新配置。重启入口会在课堂或备课仍在运行时提示先等待结束。

优先级：进程环境变量 > `.env` > 默认值。密钥只读取系统/进程环境，不从 `.env` 加载；端口和数据目录仍通过进程环境设置。支持的选项：

| 变量 | 默认值 |
| --- | --- |
| `openai_api_key` | 必需，已有的 OpenAI API 密钥 |
| `ENGLISH_LIVE_MODEL` | `gpt-live-1` |
| `ENGLISH_TEACHER_MODEL` | `gpt-5.6-terra` |
| `ENGLISH_IMAGE_MODEL` | `gpt-image-2.5-flare` |
| `ENGLISH_TRANSCRIPTION_MODEL` | `gpt-transcribe`，备课语音输入 |
| `ENGLISH_VOICE` | `marin` |
| `ENGLISH_PORT` | `3210` |
| `ENGLISH_DATA_DIR` | 项目下的 `data` 目录 |

设置页展示当前实际加载的模型与密钥配置状态，不显示密钥内容。新模型必须支持对应接口：语音使用 Live，后台使用 Responses 和函数工具，图片使用 Images。不同接口体系（例如旧 Realtime）不能只改模型名直接替换。

备课转写模型使用 `/v1/audio/transcriptions`，需支持音频文件输入和 JSON `text` 输出。`gpt-transcribe` 自动模式按官方接口传入 `languages[]=zh/en/de`；更换为其他模型系列时不发送这个专属参数，改用该模型的自动语言检测；手动选语言仍发送标准 `language`。未来模型也须兼容这些 API 能力。

录音优先使用 **WebM/Opus（单声道，目标 64 kbps）**：Chrome/Edge 原生录制，上传体积较小，无需额外 MP3 编码或 WAV 转码。若浏览器不支持，按能力选择 MP4/AAC、Ogg/Opus、WAV 或 MP3；服务端保留实际 MIME 类型和相应扩展名。文件上限 20 MiB，原始音频只在内存中处理。依据：[OpenAI 转写接口](https://developers.openai.com/api/reference/typescript/resources/audio/subresources/transcriptions/methods/create)、[GPT-Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe)。

备课示例：

- “请完善星期主题：Monday 到 Sunday 七天都安排到，跟读后继续下一天。”
- “给颜色主题加上 purple、pink、orange、black 和 white，保留原来的词。”
- “新建水果主题，包含 apple、banana、pear，配简单句型。”
- “根据这节课的实际作答情况，总结下次应该复习什么。”

星期目录默认包含七天，教学计划默认逐步覆盖全部；其他主题默认每轮少量新词。备课聊天可修改覆盖范围和教学备注。未练习的内容不会被当成学过。

## 测试

```powershell
npm.cmd test                     # 本地状态、数据一致性及字幕测试，不调用 API
npm.cmd run build               # 构建检查
npm.cmd run test:browser        # 本地浏览器流程测试，不调用 API
npm.cmd run check:api           # 检查四个模型的账号访问权限
node scripts/smoke-lesson-plans.js # 真实生成教案、口头答案判断、临时请求分流；内存测试库
node scripts/smoke-plan-image.js # 真实课前图片生成、PNG 校验与缓存复用；隔离目录
node scripts/smoke-live.js --prepared # 预备教案 + 真实 WebRTC + 合成 Monday 语音继续到 Tuesday
node scripts/check-api.js --response  # 额外进行一次极短的真实教学模型调用
node scripts/smoke-live.js --repeat   # 合成 Monday 跟读后，验证真实语音/白板继续到 Tuesday
node scripts/smoke-preparation.js     # 真实后台修改星期/颜色并新建水果主题，只使用内存测试库
node scripts/smoke-preparation.js --delete # 真实 AI 删除提议、确认执行及聊天清空，仅使用内存测试库
node scripts/smoke-transcription.js .cache/test-speech/question-transcription.webm # 用合成音频验证真实转写，不写学习档案
```

浏览器测试需要先执行 `npx.cmd playwright install chromium`。可选真实语音检查：`node scripts/smoke-live.js`，使用持续发送音频帧的合成输入，临时学习记录存放于 `.cache/live-smoke-data`，会产生少量 API 费用。它验证连接、后台出板、老师字幕、结束及结果保存。

完整口头答题测试：先运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/make-test-speech.ps1` 生成合成德语语音（需要 Windows 德语语音包），再运行 `node scripts/smoke-live.js --conversation`。它验证真实语音请求出题、点击答错、口头答对和 SQLite 保存。不会使用或录制真实麦克风。`node scripts/check-image.js` 可单独测试实际图片 API 并检查 PNG 格式、尺寸。上述真实 API 测试不能替代儿童实际说话时的听感和教学质量验收。

## 故障处理

- **Mikrofon…**：在 Chrome 地址栏左侧的权限设置允许麦克风，检查输入设备，关闭占用设备的其他程序，再点重连。
- **Ton einschalten**：浏览器阻止自动播放，点击该按钮启用声音。
- **API-Schlüssel…**：检查 Windows 环境变量；应用不读取项目配置文件中的密钥。
- **API-Limit oder Guthaben…**：检查 API 账号额度与模型权限；已保存结果不会丢失。
- **连接断开**：立即停止新的出题和计分；点 **Erneut verbinden** 继续当前白板与题目。新会话仅恢复必要的学习状态。
- **规划或图片错误**：保留当前白板；点 **Noch einmal erklären** 重试教学规划。
- **端口已被占用**：访问现有实例，或启动前设置 `ENGLISH_PORT`。

## 实现结构

- `server/lesson-plans.js`：教案校验、课前素材准备、预览与新课堂快照；SQLite 数据版本从 3 升级至 4，保留原数据。
- `server/prepared-lesson.js`：无副作用预取、单次模型判断、当前题目的提示/继续分支和浏览器渲染确认。
- `server/review.js`：依据历史题型与答题证据分开计算识别、口说状态和复习时间。
- `src/LessonPlan.jsx`：家长教案编辑、白板预览与按词能力明细。

- `server/store.js`：SQLite 事务、学习记录、去重、状态恢复和可追溯的掌握判断。
- `server/classroom.js`：每课串行教学队列、Live 服务端控制连接、浏览器渲染确认、图片过期检查及清理。
- `server/teacher.js`：教学指令和 Zod 约束的函数工具。
- `server/preparation.js`：备课聊天、受约束的主题编辑工具、批量保存与失败回滚。
- `server/openai.js`：OpenAI HTTP / Live 服务端连接适配器。
- `shared/`：起始主题与输入契约。
- `src/`：React UI、WebRTC、可修正的字幕分组。

只有服务端处理模型工具。浏览器处理媒体播放、字幕和界面，长期 API 密钥只保留在服务进程内存中。通过 Host / Origin / Fetch Metadata 检查拒绝非本机来源，关闭 iframe 嵌入；不是面向公网的多用户部署方案。

### 接口依据

实现核对了 OpenAI 官方资料：

- [Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Live 会话、字幕和结束](https://developers.openai.com/api/docs/guides/live-conversations)
- [Live 后台委托](https://developers.openai.com/api/docs/guides/live-delegation)
- [Live 服务端控制](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)

Live 字幕只有带时间区间的增量片段，没有可靠的整句完成事件或精确逐字播放对齐。本实现保留时间片段、按说话人进行可修正分组，不展示后台生成的未来整段发言；插话后的精确字幕与播放对应仍受接口时序限制。
