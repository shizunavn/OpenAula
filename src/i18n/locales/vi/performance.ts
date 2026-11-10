// Quick Settings, Actuation Point, Rapid Trigger, Dead Zone, Switch Selector, and Hall Stream.
export const VI_PERFORMANCE: Record<string, string> = {
  'Switch Selector': 'Chọn switch',
  'Actuation Point': 'Điểm nhận phím',
  'Set Actuation Point': 'Đặt điểm nhận phím',
  'Rapid Trigger': 'Rapid Trigger',
  'Hall Stream': 'Hall Stream',
  'Enable Rapid Trigger': 'Bật Rapid Trigger',
  'Rapid Trigger Sensitivity': 'Độ nhạy Rapid Trigger',
  'Separate press/release sensitivity': 'Tách độ nhạy nhấn/thả',
  'Split sensitivity': 'Tách độ nhạy',
  Sensitivity: 'Độ nhạy',
  Press: 'Nhấn',
  Release: 'Thả',
  'Dead Zone': 'Vùng chết',
  'Dead zone setting': 'Cài đặt vùng chết',
  'Top dead zone': 'Vùng chết trên',
  'Bottom dead zone': 'Vùng chết dưới',
  'Tachyon Mode': 'Chế độ Tachyon',
  Shallow: 'Nông',
  'Polling Rate': 'Tần số polling',
  'Polling rate': 'Tần số polling',
  'Auto Calibration': 'Tự động hiệu chuẩn',
  'Auto calibration': 'Tự động hiệu chuẩn',
  'Connect HERO68 before changing Tachyon Mode.': 'Kết nối HERO68 trước khi đổi Chế độ Tachyon.',
  'Unsupported configuration command': 'Lệnh cấu hình không được hỗ trợ.',
  'A higher polling rate lets the keyboard report to the computer more often. Changing it makes firmware 0323 briefly reconnect over USB.':
    'Polling rate cao hơn giúp bàn phím gửi dữ liệu tới máy tính thường xuyên hơn. Khi đổi, firmware 0323 sẽ kết nối lại USB trong chốc lát.',
  'HERO84: not verified. The official AULA driver has no polling-rate command for this board; it only reads the value. Changing it may show an error or be ignored.':
    'HERO84: chưa xác minh. Driver AULA chính thức không có lệnh đổi polling rate cho mẫu này, chỉ có lệnh đọc. Đổi có thể báo lỗi hoặc không có tác dụng.',
  'Expose the firmware auto-calibration feature toggle recovered from the AULA driver. This is separate from the live Hall Stream page.':
    'Bật/tắt tính năng tự hiệu chuẩn trong firmware được khôi phục từ driver AULA. Tính năng này tách biệt với trang Hall Stream trực tiếp.',
  'Customize the actuation point by setting the exact distance a key must be pressed before it registers a keypress.':
    'Tùy chỉnh chính xác quãng đường phím phải đi xuống trước khi được nhận là một lần nhấn.',
  'Set the point at which a key activates when pressed for all selected keys.':
    'Đặt điểm kích hoạt khi nhấn cho tất cả các phím đã chọn.',
  'The top dead zone reduces false touches, while the bottom dead zone reduces disconnection.':
    'Vùng chết trên giúp giảm chạm nhầm, còn vùng chết dưới giúp giảm mất nhận phím ở cuối hành trình.',
  "Monitor every key's Hall travel in real time. Click a key on the preview to pin it as the focused key.":
    'Theo dõi hành trình Hall của mọi phím theo thời gian thực. Bấm một phím trên bàn phím xem trước để ghim làm phím theo dõi.',
  'Start the stream, then press a key. Its travel will appear here and directly on the keyboard.':
    'Bật stream rồi nhấn một phím. Hành trình của phím sẽ hiện ở đây và ngay trên bàn phím xem trước.',
  '68-key Hall monitoring': 'Theo dõi Hall 68 phím',
  PRESSED: 'ĐANG NHẤN',
  RELEASED: 'ĐÃ THẢ',
  'RELEASED · HID': 'ĐÃ THẢ · HID',
  'Use the left rail to switch between the keyboard workspace and the new settings page.':
    'Dùng thanh bên trái để chuyển giữa khu vực bàn phím và trang cài đặt.',
  'Show Hall Stream, Gamepad, and advanced device controls. Turning this off hides them immediately.':
    'Hiện Hall Stream, Gamepad và các điều khiển thiết bị nâng cao. Tắt mục này sẽ ẩn chúng ngay.',
  'Switch profiles': 'Hồ sơ switch',
  'Assign Switch Profiles': 'Gán hồ sơ switch',
  'Search for a switch profile': 'Tìm hồ sơ switch',
  'Filter switch profiles by brand': 'Lọc hồ sơ switch theo hãng',
  'No switch profiles match the current search.':
    'Không có hồ sơ switch nào khớp tìm kiếm hiện tại.',
  'Pressed keys': 'Phím đang nhấn',
  'Recently released': 'Vừa thả',
  'Release held keys': 'Thả các phím đang giữ',
  'Add a single press or release': 'Thêm một lần nhấn hoặc thả',
  'Replay uses sample key presses. You can also click a key to trigger the preview.':
    'Phát lại dùng các lần nhấn mẫu. Bạn cũng có thể bấm một phím để kích hoạt xem trước.',
  'This baseline currently focuses on the keyboard workspace and the switch profile selector settings page.':
    'Phiên bản hiện tại tập trung vào khu vực bàn phím và trang chọn hồ sơ switch.',
  'To adjust Actuation Point, Rapid Trigger, or Dead Zone, select one or more keys first.':
    'Để chỉnh Điểm nhận phím, Rapid Trigger hoặc Vùng chết, hãy chọn ít nhất một phím trước.',
  'Mixed switch profiles': 'Nhiều hồ sơ switch',
  PRESS: 'NHẤN',
  RELEASE: 'THẢ',
  SENSITIVITY: 'ĐỘ NHẠY',
  'Instant direction switching': 'Chuyển hướng tức thì',
  'The columns follow the press and release journey. Click a point to trigger once, or drag across points to hold the selected action.':
    'Các cột đi theo hành trình nhấn và thả. Bấm một điểm để kích hoạt một lần, hoặc kéo qua nhiều điểm để giữ hành động đã chọn.',
  'Deeper presses add actions. Releasing the key removes them in reverse order.':
    'Nhấn sâu hơn sẽ thêm hành động. Khi thả phím, các hành động được gỡ theo thứ tự ngược lại.',
  'When both keys are pressed': 'Khi cả hai phím được nhấn',
  'Or click here and press a physical key to assign it.':
    'Hoặc bấm vào đây rồi nhấn một phím vật lý để gán.',
  'Save to the keyboard, then click here and press your configured key.':
    'Lưu vào bàn phím, sau đó bấm vào đây và nhấn phím đã cấu hình.',
  'Recording — press keys or mouse buttons. Recording continues until you click':
    'Đang ghi — hãy nhấn phím hoặc nút chuột. Quá trình ghi tiếp tục cho tới khi bạn bấm',
  ', then press your shortcut or sequence.': ', sau đó nhấn phím tắt hoặc chuỗi phím.',
  'Recording stopped. Any held keys were released automatically.':
    'Đã dừng ghi. Các phím đang giữ đã được thả tự động.',
  'Save “{name}” to your library before switching, or discard its unsaved edits.':
    'Lưu “{name}” vào thư viện trước khi chuyển, hoặc bỏ các chỉnh sửa chưa lưu.',
  'Adjusting Actuation Point for {count} selected key.':
    'Đang chỉnh Điểm nhận phím cho {count} phím đã chọn.',
  'Adjusting Actuation Point for {count} selected keys.':
    'Đang chỉnh Điểm nhận phím cho {count} phím đã chọn.',
  'To adjust Actuation Point, select one or more keys first.':
    'Để chỉnh Điểm nhận phím, trước tiên hãy chọn một hoặc nhiều phím.',
  'Changing Actuation Point for': 'Đang thay đổi Điểm nhận phím cho',
  "Read the selected keys' real Hall travel and compare it with their Actuation Point while you press them.":
    'Đọc hành trình Hall thực tế của các phím đã chọn và so sánh với Điểm nhận phím khi bạn nhấn.',
  'Press a selected key': 'Nhấn một phím đã chọn',
  'Selected-key Hall poll': 'Polling Hall của phím đã chọn',
  'Press any selected key. The most recently moving selected key is shown here.':
    'Nhấn bất kỳ phím đã chọn nào. Phím vừa chuyển động gần nhất sẽ hiển thị tại đây.',
  'Adjusting Rapid Trigger for {count} selected key.':
    'Đang chỉnh Rapid Trigger cho {count} phím đã chọn.',
  'Adjusting Rapid Trigger for {count} selected keys.':
    'Đang chỉnh Rapid Trigger cho {count} phím đã chọn.',
  'To adjust Rapid Trigger, please select one or more keys first.':
    'Để chỉnh Rapid Trigger, trước tiên hãy chọn một hoặc nhiều phím.',
  travel: 'hành trình',
  'Pair two keys and choose which input takes priority when both are pressed.':
    'Ghép hai phím và chọn đầu vào được ưu tiên khi cả hai cùng được nhấn.',
  'Assign up to four actions to different points of a key press and release.':
    'Gán tối đa bốn hành động vào các điểm khác nhau trong hành trình nhấn và thả phím.',
  'Tap to lock an action on or off. Hold the key for normal press and release.':
    'Chạm để khóa bật/tắt một hành động. Giữ phím để nhấn và thả bình thường.',
  'Release Action (END)': 'Hành động khi thả (END)',
  'Keep the normal key press and send an additional action when you release it.':
    'Giữ thao tác nhấn phím bình thường và gửi thêm một hành động khi thả phím.',
  'The last key pressed overrides the first.': 'Phím được nhấn sau sẽ ghi đè phím đầu tiên.',
  'Neither key is active while both are pressed.':
    'Không phím nào hoạt động khi cả hai cùng được nhấn.',
  'Start of press': 'Bắt đầu nhấn',
  'Deep press': 'Nhấn sâu',
  'Release from deep': 'Thả từ điểm sâu',
  'End of release': 'Kết thúc thả',
  'Tap at deep press': 'Chạm ở điểm nhấn sâu',
  'Tap on release from deep': 'Chạm khi thả từ điểm sâu',
  'Tap at end of release': 'Chạm khi kết thúc thả',
  'Fast attack. Release only softens the fade.':
    'Phản hồi vào nhanh. Release chỉ làm mượt phần tắt dần.',
  'Local preview · sample key presses': 'Xem trước cục bộ · mô phỏng nhấn phím',
  'Preview only · sample key presses repeat automatically. Click or type to try your own keys.':
    'Chỉ xem trước · các lần nhấn phím mẫu tự lặp lại. Nhấp hoặc gõ để thử phím của bạn.',
  'Release / smoothing': 'Release / làm mượt',
  'Click or type to simulate a press. Apply with the app for actual analog feedback.':
    'Nhấp hoặc gõ để mô phỏng một lần nhấn. Áp dụng bằng ứng dụng để dùng phản hồi analog thực tế.',
  'The illuminated area expands with analog key travel.':
    'Vùng sáng mở rộng theo hành trình analog của phím.',
  'Expanding rings follow each key press.': 'Các vòng sáng mở rộng theo mỗi lần nhấn phím.',
  'The number row displays the deepest analog key travel as a bar.':
    'Hàng số hiển thị hành trình analog sâu nhất dưới dạng thanh.',
  'Pressed keys light up and fade after release.': 'Phím được nhấn sẽ sáng rồi mờ dần sau khi thả.',
  'Left, Down and Right arrow travel mix red, green and blue.':
    'Hành trình các phím mũi tên Trái, Xuống và Phải trộn đỏ, xanh lá và xanh dương.',
  'Each key press lights that key, then fades over time.':
    'Mỗi lần nhấn sẽ làm sáng phím đó rồi mờ dần theo thời gian.',
  'Green/red shows the reported Hall pressed flag. Its correspondence to firmware RT output is unverified.':
    'Xanh lá/đỏ hiển thị cờ Hall pressed được báo về. Mối tương ứng với đầu ra RT của firmware chưa được xác minh.',
  'Rapid Trigger dynamically actuates and resets your key based on your intention to press or release the key. Rapid Trigger starts and ends after the actuation point.':
    'Rapid Trigger tự động kích hoạt và reset phím dựa trên chuyển động nhấn hoặc thả. Rapid Trigger bắt đầu và kết thúc sau điểm nhận phím.',
  'Update the background app to use Tachyon Mode.': 'Cập nhật ứng dụng nền để dùng chế độ Tachyon.',
  'The top dead zone reduces false touches, while the bottom dead zone helps prevent unintended release near full travel.':
    'Vùng chết phía trên giúp giảm chạm nhầm, còn vùng chết phía dưới giúp tránh việc thả phím ngoài ý muốn khi gần hết hành trình.',
  'The actuation point is the distance a key must travel before it registers a keypress. A lower value activates the key with a lighter press; a higher value requires a deeper press.':
    'Điểm nhận phím là quãng đường phím phải đi xuống để ghi nhận một lần nhấn. Giá trị thấp giúp phím kích hoạt khi nhấn nhẹ; giá trị cao yêu cầu nhấn sâu hơn.',
  'Select one or more keys to adjust their actuation point. Use a shallow setting for fast inputs, or a deeper setting to help avoid accidental keypresses when typing.':
    'Chọn một hoặc nhiều phím để chỉnh điểm nhận phím. Đặt điểm nhận nông để thao tác nhanh, hoặc sâu hơn để hạn chế nhấn nhầm khi gõ.',
  'Rapid Trigger dynamically adjusts the actuation and deactivation points. After the key reaches its actuation point, pressing it down activates it and releasing it resets it according to the sensitivity you set.':
    'Rapid Trigger tự động điều chỉnh điểm kích hoạt và điểm ngắt phím. Sau khi phím đạt điểm nhận, chuyển động nhấn xuống sẽ kích hoạt phím và chuyển động thả lên sẽ ngắt phím theo độ nhạy bạn đã đặt.',
  "This can make repeated inputs faster in competitive games: you don't have to fully release a key before pressing it again. A lower sensitivity value requires less movement, while a higher value helps avoid unintended inputs.":
    'Tính năng này giúp nhấn phím liên tiếp nhanh hơn trong game: bạn không cần thả phím hoàn toàn trước khi nhấn lại. Giá trị độ nhạy thấp cần ít chuyển động hơn, còn giá trị cao giúp hạn chế thao tác ngoài ý muốn.',
  'Set separate Rapid Trigger sensitivities for pressing and releasing a key. Press sensitivity controls how far the key moves down to reactivate; release sensitivity controls how far it moves up to reset.':
    'Đặt độ nhạy Rapid Trigger riêng cho nhấn và thả phím. Độ nhạy nhấn quyết định quãng đường đi xuống để kích hoạt lại; độ nhạy thả quyết định quãng đường đi lên để ngắt phím.',
  'Use a smaller release value for a quicker reset, or a larger press value to reduce accidental reactivation. With split sensitivity off, the same value applies in both directions.':
    'Giảm giá trị thả để ngắt phím nhanh hơn, hoặc tăng giá trị nhấn để hạn chế kích hoạt lại ngoài ý muốn. Khi tắt độ nhạy riêng, cả hai hướng dùng cùng một giá trị.',
  'Release within {delay} ms to send {tap}. Hold longer to send {hold}.':
    'Thả trong {delay} ms để gửi {tap}. Giữ lâu hơn để gửi {hold}.',
  'Release within {delay} ms to toggle {action}. Hold longer for a normal press and release.':
    'Thả trong {delay} ms để bật / tắt {action}. Giữ lâu hơn để nhấn và thả như bình thường.',
  'Assign different actions to a key based on how you press it, or pair two keys to control simultaneous inputs.':
    'Gán các hành động khác nhau theo cách bạn nhấn phím, hoặc ghép hai phím để điều khiển khi chúng được nhấn cùng lúc.',
  'Keep WASD held and add Shift at full press for running.':
    'Giữ WASD và thêm Shift khi nhấn hết hành trình để chạy nhanh.',
  'Keep W held and add Shift at full press for running.':
    'Giữ W và thêm Shift khi nhấn hết hành trình để chạy nhanh.',
  'Build a sequence of key presses, releases and delays. Record a sequence or add keystrokes, then edit each event.':
    'Tạo chuỗi nhấn phím, thả phím và khoảng chờ. Ghi lại chuỗi thao tác hoặc thêm từng lần nhấn, sau đó chỉnh từng sự kiện.',
  'Add press of {key}': 'Thêm lần nhấn {key}',
  'Add release of {key}': 'Thêm lần thả {key}',
  'HERO68 read timed out (command={command}, zone={zone})':
    'HERO68 không phản hồi kịp thời (lệnh={command}, vùng={zone})',
  'Hall polling stopped: {error}. Close other keyboard apps or tabs, reconnect HERO68, then start again.':
    'Đã dừng đọc dữ liệu Hall: {error}. Đóng các ứng dụng hoặc tab khác đang dùng bàn phím, kết nối lại HERO68 rồi bắt đầu lại.',
  'Firmware multi-key polling stopped: {error}':
    'Đã dừng đọc dữ liệu nhiều phím từ firmware: {error}',
  'Service Hall stream disconnected': 'Luồng Hall từ dịch vụ đã ngắt kết nối',
  'Connect HERO68 before starting Hall Stream': 'Kết nối HERO68 trước khi bắt đầu luồng Hall',
  'Service Hall stream uses direct polling only.':
    'Luồng Hall từ dịch vụ chỉ hỗ trợ đọc trực tiếp.',
  'HERO68 USB interface disconnected during Hall Stream ({stage}).':
    'Kết nối USB của HERO68 bị ngắt khi đang chạy luồng Hall ({stage}).',
  'Recovering Hall telemetry…': 'Đang phục hồi dữ liệu Hall…',
  'HERO68 send timed out (command={command}, zone={zone})':
    'HERO68 không nhận được lệnh kịp thời (lệnh={command}, vùng={zone})',
  'Press a key': 'Nhấn một phím',
  'Switch travel simulator': 'Giả lập hành trình switch',
  'Click and hold to press, or drag vertically to scrub travel':
    'Nhấn giữ để bấm phím, hoặc kéo dọc để thử hành trình',
  'Test press': 'Nhấn',
  'Hold the switch pressed down (drag the switch to adjust held depth)':
    'Giữ switch ở trạng thái nhấn (kéo dọc trên switch để chỉnh độ sâu giữ)',
  'Drag selection mode': 'Chế độ kéo chọn phím',
  'Box drag': 'Kéo khung',
  'Swipe keys': 'Lướt phím',
  'Hold and drag a box to select multiple keys (Alt to deselect)':
    'Nhấn giữ và kéo khung chữ nhật để chọn nhiều phím (giữ Alt để bỏ chọn)',
  'Hold and swipe across keys to select or deselect':
    'Nhấn giữ và lướt chuột qua các phím để chọn hoặc bỏ chọn',
  'Auto sim': 'Tự động',
  'SIMULATED SWITCH': 'SWITCH GIẢ LẬP',
  SIMULATING: 'GIẢ LẬP',
  'Travel simulation': 'Giả lập hành trình',
  'Press or drag the switch on the left to simulate key travel and actuation.':
    'Nhấn giữ hoặc kéo dọc switch bên trái để giả lập hành trình và điểm nhận phím.',
  'Connect HERO68 for live Hall telemetry, or press/drag the switch preview to simulate travel.':
    'Kết nối HERO68 để đọc Hall thực tế, hoặc nhấn/kéo switch xem trước để giả lập hành trình.'
};
