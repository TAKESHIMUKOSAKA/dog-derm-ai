# Dog Derm AI MVP v0.2 — iPhone/PWA Ready

犬の皮膚疾患を対象とした、獣医師向け Clinical Decision Support のMVPです。

## v0.2で追加した機能

- iPhone Safari対応
- Safariの「ホーム画面に追加」でアプリ風に起動できるPWA
- iPhoneカメラから直接皮疹を撮影
- 写真ライブラリから複数画像を選択
- 画像をブラウザ側でJPEG化し、長辺1800px・品質0.88へ最適化
  - 通信量を抑える
  - EXIFメタデータを原則として除去
  - HEICをSafariでデコードできる場合はJPEGへ変換
- 解析結果をiPhoneの共有シートから共有
- 公開URL用の `APP_ACCESS_KEY` 保護
- Evidence Guard: 登録済みEvidence ID以外を引用として表示しない

## 入力

- 皮疹画像 最大6枚
- 犬種
- 現在年齢
- 発症年齢
- 性別
- 発症期間
- 急性/慢性/再発性
- 掻痒の有無・pVAS
- 痒みと皮疹の発症順序
- 季節性
- ノミ・マダニ予防
- 皮疹分布
- 獣医師による皮疹名（任意）
- 過去の治療と反応
- 同居動物/人の皮疹
- 消化器症状
- 食事/除去食歴
- 全身症状・その他

## 出力

- 画像品質
- 皮疹の形態学的記載
- Problem representation
- Red flags
- 鑑別診断ランキング（HIGH / MODERATE / LOW）
- 各鑑別の支持所見 / 反証所見 / 不足情報
- 追加問診
- 推奨検査
- 条件付き治療案
- Evidence grade / Recommendation strength
- 検証済みEvidence Libraryへの参照

## 1. PCから同じWi-FiのiPhoneで試す

Windowsでは `start_iphone.bat` を実行してください。
Mac/Linuxでは `./start_iphone.sh` を実行してください。

表示された `http://192.168.x.x:8000` のようなURLを、同じWi-Fiに接続したiPhoneのSafariで開きます。

> LAN内HTTPではSafariから使えますが、本格的なPWA運用と院外アクセスにはHTTPSの公開URLを推奨します。

## 2. 公開URLにする — Vercel推奨

このプロジェクトはFastAPIアプリをルートの `app.py` として公開しており、Vercelの現在のFastAPI zero-configuration deploymentに合わせた構造です。

必要な環境変数:

- `OPENAI_API_KEY` — OpenAI APIキー
- `OPENAI_MODEL` — 任意。デフォルト `gpt-5.6`
- `OPENAI_REASONING_EFFORT` — 任意。デフォルト `medium`
- `APP_ACCESS_KEY` — **公開URLでは強く推奨**。長い秘密のアクセスキー

公開後は `https://<project>.vercel.app` をiPhoneのSafariで開きます。

### iPhoneのホーム画面に追加

1. Safariで公開URLを開く
2. 共有ボタンをタップ
3. 「ホーム画面に追加」
4. 「追加」

以後はDog Derm AIのアイコンから起動できます。

## 3. ローカルPCで通常起動

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

`http://127.0.0.1:8000` を開きます。

## 4. APIキーを設定しない場合

`OPENAI_API_KEY` がない場合はDEMO MODEになります。画面や診療フローの確認はできますが、画像そのものは解析しません。

## セキュリティ上の注意

- OpenAI APIキーはJavaScriptやiPhone内に埋め込まず、サーバーの環境変数に置きます。
- 公開URLでは `APP_ACCESS_KEY` を必ず設定することを推奨します。
- このMVPのFastAPIコードはアップロード画像をサーバーディスクへ保存しません。ただし解析時には画像データがAI APIへ送信されます。実運用前に利用規約、プライバシーポリシー、院内規程を整備してください。
- 動物名、飼い主名、電話番号、住所など診断に不要な個人識別情報は入力しない運用を推奨します。

## 次期版候補

- 細胞診結果を追加入力して鑑別を再評価
- 顕微鏡画像解析
- 症例履歴保存（明示的オプトイン）
- Evidence Library管理画面
- 文献更新ワークフロー
- 皮膚病変の部位マップ
- 猫対応 / 耳科対応
