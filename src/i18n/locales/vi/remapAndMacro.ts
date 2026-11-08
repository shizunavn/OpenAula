// Key Remap, Advanced Keys (DKS, Mod-Tap, Toggle, SOCD, MPT, END), and Macro Editor.
export const VI_REMAP_AND_MACRO: Record<string, string> = {
  'Select the LED region for this layer.': 'Chọn vùng LED cho lớp hiệu ứng này.',
  'Key Remap': 'Gán lại phím',
  Macros: 'Macro',
  'Add binding': 'Thêm liên kết',
  'Configure binding': 'Cấu hình liên kết',
  Bindings: 'Liên kết',
  'No Advanced Keys configured yet. Select a type on the left to add your first binding.':
    'Chưa có phím nâng cao nào được cấu hình. Chọn một loại bên trái để thêm liên kết đầu tiên.',
  'After saving, test the binding from the configured bindings list.':
    'Sau khi lưu, hãy thử liên kết trong danh sách đã cấu hình.',
  'Remove binding': 'Xóa liên kết',
  'Remove this binding?': 'Xóa liên kết này?',
  'Replace existing bindings?': 'Thay thế liên kết hiện có?',
  'Test your binding': 'Thử liên kết',
  'Remap keys': 'Gán lại phím',
  Layers: 'Lớp',
  'Presets apply to the selected layer.': 'Preset chỉ áp dụng cho lớp đang chọn.',
  'Select a key, then choose a function or macro.':
    'Chọn một phím, sau đó chọn chức năng hoặc macro.',
  'Search functions or macros…': 'Tìm chức năng hoặc macro…',
  'Copy layer': 'Sao chép lớp',
  'Paste layer': 'Dán lớp',
  'Create a macro in Macros to get started.': 'Tạo một macro trong mục Macro để bắt đầu.',
  'Layer keys, shortcuts and device controls.': 'Phím lớp, phím tắt và điều khiển thiết bị.',
  'Macro library': 'Thư viện macro',
  'Local + HERO68 macro library': 'Thư viện macro cục bộ + HERO68',
  'New macro': 'Macro mới',
  'Your macros': 'Macro của bạn',
  'Search macros…': 'Tìm macro…',
  'Create a macro to start your library.': 'Tạo một macro để bắt đầu thư viện.',
  'No macros match your search.': 'Không có macro nào khớp tìm kiếm.',
  'Your first macro starts here': 'Macro đầu tiên của bạn bắt đầu ở đây',
  'Create macro': 'Tạo macro',
  'Macro name': 'Tên macro',
  'Remapped functions': 'Chức năng đã gán lại',
  'Keyboard layers': 'Lớp bàn phím',
  'Base layer': 'Lớp nền',
  'Effect layers': 'Các lớp hiệu ứng',
  'Lower layers blend over earlier ones.': 'Các lớp phía dưới sẽ hòa trộn lên những lớp trước.',
  'Add RGB FX layer': 'Thêm lớp hiệu ứng RGB',
  'Add a layer to animate over your base colors.': 'Thêm một lớp để tạo hiệu ứng trên màu nền.',
  'Stages the base for the profile Save button. FX layers stay in your local preset.':
    'Đưa lớp nền vào bản nháp cho nút Lưu hồ sơ. Các lớp FX vẫn nằm trong preset cục bộ.',
  'Main Layer': 'Lớp chính',
  'Ready-made bindings': 'Liên kết dựng sẵn',
  'Enable layer': 'Bật lớp',
  'Layer color': 'Màu lớp',
  'Save writes the complete macro definition library to HERO68 using CMD 0x05. Playback behavior takes effect only after a macro is assigned to a key.':
    'Lưu sẽ ghi toàn bộ thư viện định nghĩa macro vào HERO68 bằng CMD 0x05. Cách phát lại chỉ có hiệu lực sau khi macro được gán cho một phím.',
  'Your editable copy is kept locally. Connect HERO68, then save to write the definitions; assign them from Key Remap → Macros.':
    'Bản có thể chỉnh sửa được lưu cục bộ. Kết nối HERO68 rồi lưu để ghi định nghĩa; gán chúng tại Gán lại phím → Macro.',
  'Keyboard layer': 'Lớp bàn phím',
  '{preset} applied to {layer}. Save to profile to keep it.':
    'Đã áp dụng {preset} cho {layer}. Hãy lưu vào hồ sơ để giữ thay đổi.',
  'Macro playback mode': 'Chế độ phát macro',
  'Macro library could not be read: {error}': 'Không thể đọc thư viện macro: {error}',
  'No macros match “{query}”.': 'Không có macro nào khớp “{query}”.',
  'No functions or macros match “{query}”.': 'Không có chức năng hoặc macro nào khớp “{query}”.',
  'Duplicate macro': 'Nhân bản macro',
  'Delete macro': 'Xóa macro',
  'Save macro': 'Lưu macro',
  'Saved locally. Connect HERO68 and save again to write this macro library to the keyboard.':
    'Đã lưu cục bộ. Kết nối HERO68 và lưu lại để ghi thư viện macro vào bàn phím.',
  'Saved locally and wrote the macro library to HERO68 ({count} packet).':
    'Đã lưu cục bộ và ghi thư viện macro vào HERO68 ({count} packet).',
  'Saved locally and wrote the macro library to HERO68 ({count} packets).':
    'Đã lưu cục bộ và ghi thư viện macro vào HERO68 ({count} packet).',
  'Saved locally, but HERO68 macro sync failed: {error}':
    'Đã lưu cục bộ nhưng đồng bộ macro với HERO68 thất bại: {error}',
  'Imported {count} macro into your local library.': 'Đã nhập {count} macro vào thư viện cục bộ.',
  'Imported {count} macros into your local library.': 'Đã nhập {count} macro vào thư viện cục bộ.',
  'Advanced Keys could not be read: {error}. Read the profile again before saving these bindings.':
    'Không thể đọc Phím nâng cao: {error}. Hãy đọc lại hồ sơ trước khi lưu các thiết lập này.',
  'Firmware binding': 'Liên kết firmware',
  'Connect HERO68 to write saved macro definitions to the keyboard, then use Key Remap → Macros to assign one to a key.':
    'Kết nối HERO68 để ghi các định nghĩa macro đã lưu vào bàn phím, sau đó vào Gán lại phím → Macro để gán macro cho một phím.',
  'Dynamic Keystroke (DKS)': 'Nhấn phím động (DKS)',
  'Mod Tap': 'Mod Tap',
  'Toggle Key': 'Phím bật / tắt',
  'Hold: start → deep press': 'Giữ: bắt đầu → nhấn sâu',
  'Hold: deep press → release from deep': 'Giữ: nhấn sâu → thả từ điểm sâu',
  'Hold: release from deep → end': 'Giữ: thả từ điểm sâu → kết thúc',
  'Hold: start → release from deep': 'Giữ: bắt đầu → thả từ điểm sâu',
  'Hold: start → end': 'Giữ: bắt đầu → kết thúc',
  'Hold: deep press → end': 'Giữ: nhấn sâu → kết thúc',
  'Aurora is now a Base effect. Move this layer to cover all keys and control its brightness directly.':
    'Aurora giờ là hiệu ứng nền. Chuyển layer này sang nền để phủ toàn bộ phím và điều khiển độ sáng trực tiếp.',
  'Open Hero68RgbService.exe. The app appears in the system tray. Open Custom Effects, choose your layers, then Apply to keyboard.':
    'Mở Hero68RgbService.exe. Ứng dụng sẽ xuất hiện trong khay hệ thống. Mở Custom Effects, chọn các layer rồi nhấn Áp dụng lên bàn phím.',
  'Soft color curtains across all keys. Add FX layers for key reactions.':
    'Các dải màu mềm trải trên toàn bộ phím. Thêm layer FX để tạo phản ứng theo phím.',
  'Stages the base for Save. Custom layers remain in your local preset.':
    'Đưa lớp nền vào trạng thái chờ Save. Các layer tùy chỉnh vẫn nằm trong preset cục bộ.',
  'Add layer': 'Thêm layer',
  'Choose a layer to bring your base colors to life.':
    'Chọn một layer để làm lớp màu nền sinh động hơn.',
  'Delete selected layer': 'Xóa layer đã chọn',
  'Enable {name} layer {index}': 'Bật layer {name} {index}',
  'FX layers · Changes stay in this profile': 'layer FX · Thay đổi chỉ lưu trong hồ sơ này',
  'Layer affects {count}': 'Layer ảnh hưởng {count} phím',
  'Move layer down': 'Di chuyển layer xuống',
  'Move layer up': 'Di chuyển layer lên',
  'The layer gently fades in and out.': 'Layer sáng lên và mờ đi nhẹ nhàng.',
  'Main Layer is your normal layout. Hold Fn or Fn1 to use the corresponding Fn layer.':
    'Lớp chính là bố cục sử dụng thường ngày. Giữ Fn hoặc Fn1 để dùng lớp Fn tương ứng.',
  'Select a binding to edit its behavior.': 'Chọn một liên kết để chỉnh hành vi của nó.',
  'Hold: {hold} · Tap: {tap}': 'Giữ: {hold} · Chạm: {tap}',
  'On release: {action}': 'Khi thả: {action}',
  'This firmware binding is preserved, but its editor is unavailable.':
    'Liên kết firmware này được giữ nguyên, nhưng chưa hỗ trợ chỉnh sửa.',
  '{key} already has an Advanced Key. Edit or remove that binding first.':
    'Phím {key} đã có liên kết nâng cao. Hãy chỉnh sửa hoặc xóa liên kết đó trước.',
  'Binding updated in your profile draft. Save the profile to apply it to the keyboard.':
    'Đã cập nhật liên kết trong bản nháp hồ sơ. Lưu hồ sơ để áp dụng lên bàn phím.',
  'Binding added to your profile draft. Save the profile to apply it to the keyboard.':
    'Đã thêm liên kết vào bản nháp hồ sơ. Lưu hồ sơ để áp dụng lên bàn phím.',
  '{name} will replace bindings on {keys}. Paired keys in a replaced binding are removed together.':
    '{name} sẽ thay thế liên kết trên các phím {keys}. Các phím ghép cặp trong liên kết bị thay thế sẽ được xóa cùng nhau.',
  'Choose a mode, select its physical key or keys, then configure the binding. Add binding or Apply changes keeps your edits locally; Save to profile sends them to the keyboard.':
    'Chọn chế độ, chọn phím trên bàn phím rồi cấu hình liên kết. Thêm liên kết hoặc Áp dụng thay đổi sẽ giữ bản chỉnh sửa trên máy; Lưu vào hồ sơ sẽ gửi chúng lên bàn phím.',
  'Mod Tap Arrow Keys': 'Phím mũi tên với Mod Tap',
  'Tap R-Alt / R-Shift / R-Ctrl / Fn for ← / ↑ / → / ↓. Hold for their normal actions.':
    'Chạm R-Alt / R-Shift / R-Ctrl / Fn để gửi ← / ↑ / → / ↓. Giữ để dùng chức năng thông thường của các phím.',
  'Mod Tap Fn 2 on Caps Lock': 'Mod Tap Fn 2 trên Caps Lock',
  'Hold Caps Lock for Fn Layer 2; tap for Caps Lock.':
    'Giữ Caps Lock để dùng lớp Fn 2; chạm để dùng Caps Lock.',
  'Toggle Function Layer 1': 'Bật / tắt lớp Fn 1',
  'Tap the Fn key to toggle Fn Layer 1; hold for normal Fn behavior.':
    'Chạm phím Fn để bật / tắt lớp Fn 1; giữ để dùng Fn như bình thường.',
  'Toggle Function Layer 2 on Caps Lock': 'Bật / tắt lớp Fn 2 bằng Caps Lock',
  'Use Caps Lock to toggle Fn Layer 2 on and off.': 'Dùng Caps Lock để bật và tắt lớp Fn 2.',
  'Save keeps an editable local copy and, while HERO68 is connected, also writes the macro definition library with the recovered CMD 0x05 protocol. Assign saved macros to physical keys from Key Remap → Macros; the on-device playback mode and count are selected there. Preview only animates the sequence; it does not send keys to other applications.':
    'Lưu sẽ giữ một bản có thể chỉnh sửa trên máy và ghi thư viện macro lên HERO68 khi bàn phím đang kết nối, qua giao thức CMD 0x05 đã khôi phục. Gán macro đã lưu cho phím tại Gán phím → Macro; chọn chế độ phát và số lần lặp trên bàn phím tại đó. Xem trước chỉ mô phỏng chuỗi thao tác, không gửi phím đến ứng dụng khác.',
  'Macro recording area': 'Vùng ghi macro',
  Unsupported: 'Chưa hỗ trợ',
  Unverified: 'Chưa xác minh',
  'DKS is not supported on WIN 68 HE MAX': 'DKS chưa được hỗ trợ trên WIN 68 HE MAX',
  'The firmware supports DKS, but its frame layout has not been verified by USB capture yet, so OpenAula blocks writing it to avoid corrupting your key configuration.':
    'Firmware có hỗ trợ, nhưng layout frame chưa xác minh bằng capture nên app chưa ghi — tránh làm hỏng cấu hình phím.',
  'MT, TGL, MPT, and END are verified and ready to use.': 'MT / TGL / MPT / END vẫn dùng được.',
  'View documentation': 'Xem tài liệu',
  Close: 'Đóng',
  'Default SOCD (type = 0, mode = 0)': 'SOCD mặc định (type = 0, mode = 0)',
  'Verified capture layout for WIN 68 HE MAX.':
    'Layout đã xác minh bằng capture trên WIN 68 HE MAX.',
  'Other SOCD modes (mode 1–3)': 'Các chế độ SOCD khác (mode 1–3)',
  'Unverified — no USB capture with non-zero type/mode/delay yet.':
    'Chưa xác minh — chưa có capture USB cho các giá trị khác 0.',
  'Rappy Snappy (RS)': 'Rappy Snappy (RS)',
  'DDKS / Poll-rate (0x29)': 'DDKS / Poll-rate (0x29)',
  'Unverified on WIN 68 HE MAX — blocked until USB capture is available.':
    'Chưa xác minh trên WIN 68 HE MAX — bị chặn cho đến khi có capture USB.'
};
