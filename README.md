# DRAW AIR HOCKEY

スマホ対応の1vs1オンライン・エアーホッケーです。

## できること

- 真上視点のエアーホッケー
- 先に5点で勝利
- プレイヤーごとにパックとマレットを自由に手描き
- 描いた輪郭をMatter.jsの物理ボディとして使用
- 形によって衝突角度・回転・跳ね返りが変化
- オンラインランダムマッチング
- 5桁英数字のプライベートルーム
- GitHub Pagesで公開可能
- スマホのタッチ操作対応

## 重要：GitHub Pagesだけではオンライン対戦の「部屋・マッチング情報」を保存できません

そのため、このプロジェクトは、

**ゲーム画面 → GitHub Pages**
**オンラインの部屋・マッチング → Supabase無料枠**

という構成です。

---

# 1. Supabaseを作る

Supabaseで無料プロジェクトを1つ作成します。

https://supabase.com/

Projectを作ったら、SQL Editorを開いて下のSQLをそのまま実行してください。

```sql
create table if not exists public.rooms (
  code text primary key,
  host_id uuid not null,
  guest_id uuid,
  status text not null default 'waiting',
  created_at timestamptz not null default now()
);

create table if not exists public.match_queue (
  id uuid primary key,
  player_id uuid not null,
  status text not null default 'waiting',
  room_code text,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.match_queue enable row level security;

create policy "rooms_read" on public.rooms
for select to anon using (true);

create policy "rooms_insert" on public.rooms
for insert to anon with check (true);

create policy "rooms_update" on public.rooms
for update to anon using (true) with check (true);

create policy "queue_read" on public.match_queue
for select to anon using (true);

create policy "queue_insert" on public.match_queue
for insert to anon with check (true);

create policy "queue_update" on public.match_queue
for update to anon using (true) with check (true);

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.match_queue;
```

## 2. config.jsを編集

Supabaseの

- Project URL
- anon public key

を取得して、config.jsの2か所を書き換えます。

```js
window.AIR_HOCKEY_CONFIG = {
  SUPABASE_URL: "https://あなたのproject.supabase.co",
  SUPABASE_ANON_KEY: "あなたのanon-key"
};
```

**service_role keyは絶対に入れないでください。**
GitHub Pagesに公開するのはanon keyです。

## 3. GitHubへアップロード

このフォルダの中身をGitHubリポジトリのルートにアップロードします。

最低限、

- index.html
- style.css
- config.js
- game.js

が同じ階層にある状態にしてください。

## 4. GitHub Pages

GitHubリポジトリの

Settings
→ Pages
→ Build and deployment
→ Source: Deploy from a branch
→ Branch: main
→ / (root)
→ Save

にします。

数分後に、

https://ユーザー名.github.io/リポジトリ名/

で公開できます。

---

## ゲームの仕組み

ホスト側がMatter.jsで物理演算を行い、約30msごとにパック・マレットの状態を相手へ送ります。

手描き形状はポリゴン化してMatter.Bodies.fromVertices()に渡しています。

したがって、例えば

- 三角形 → 面に当たって鋭く方向が変わる
- 細長い形 → 回転しながら弾く
- ギザギザ形 → 独特の角度で跳ねる

など、形状による違いを出せます。

## 注意

これは「まず実際にオンライン対戦を成立させるためのベース版」です。

本格公開版にする場合は、次の改善がおすすめです。

1. 不正操作対策（サーバー側権威化）
2. 切断・再接続処理
3. ルームの自動削除
4. マッチング待ちのキャンセル
5. ping / ラグ表示
6. 物理演算の同期補間
7. マレットの速度や回転も含めた同期
8. 手描き形状の見た目をそのまま表示
9. スマホでの操作感調整
10. 効果音・BGM・勝利演出
