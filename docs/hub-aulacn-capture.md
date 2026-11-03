# Hub bundle của AULA: lấy đủ file (không qua script trong trang)

Server `hub.aulacn.com` chặn IP lạ (403/522/525) và trang tự nhảy `/` ↔ `/home`,
nên gói bằng `fetch` trong trang chỉ ra 7 file. Cách chắc chắn: **DevTools →
Network** bắt đúng những gì trang thật tải (kể cả chunk lazy, wasm, worker),
rồi export HAR.

## Bước 1 — ghi lại lượt tải đầy đủ

1. Mở tab **mới**, F12 → tab **Network**, tick **Preserve log**
   (và **Disable cache** cũng tiện).
2. (`/home` hiện trong History của tab thì vào bằng **Ctrl+Shift+Delete** hay
   mở lại qua bookmark; nếu không vào được `/home`, cứ làm bước 3 ở trang nào
   vào được.)
3. Bấm **Reload**, rồi **thao tác như người dùng**: bấm cài/cài đặt thiết bị,
   mở trang bàn phím, mở trang lighting/macro — càng nhiều màn hình càng đủ
   chunk. Nếu được, cắm phím và bấm **connect** (lúc đó mới tải SDK HID).
   Ô **Filter** gõ `-bt-stats` để ẩn tracker, và bật **XHR** + **JS** +
   **Fetch/XHR** + **WS** cho chắc.
4. Chuột phải vùng danh sách Network → **Save all as HAR with content** →
   `hub-aulacn.har`.

## Bước 2 — gửi lại cho tôi

Đặt `hub-aulacn.har` vào `C:\Users\nguye\Downloads` và báo đường dẫn. Tôi sẽ:

- trích mọi response `.js` / `.css` / `.wasm` / `.json` / worker trong HAR ra
  thư mục `hub-aulacn/` giữ nguyên đường dẫn;
- kiểm tra chunk nào thiếu (so danh sách import với file đã có) và **chỉ nêu
  đúng những file còn thiếu** để anh bấm lại một vòng nữa khi cần;
- gói `hub-aulacn/` + repo + `HANDOFF-vendor-tap.md` vào một zip và viết prompt
  bàn giao cho AI khác.

## Vì sao không dùng lại script cũ

Script `fetch` trong Console chỉ lấy được HTML + 7 file ở trang hiện tại:
- trang `/home` redirect vòng nên `fetch('/home')` trả về trang lỗi;
- chunk lazy chỉ tải khi **mở đúng màn hình đó**, script không bấm thay người
  dùng được;
- các tên kiểu `yxt_mouse_sdk_bg.js`, `TglCKVxb.js` trả 404 vì chúng được nạp
  với đường dẫn khác (worker/webhid sdk), chỉ Network mới thấy URL thật.
