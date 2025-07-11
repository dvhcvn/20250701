# Đơn vị hành chính mới tháng 7, 2025

Chờ mãi không thấy ai chia sẻ bộ mapping đơn vị hành chính trước và sau ngày 01/07/2025, nên đành phải tự xử.

## Cách sử dụng

- Trực tiếp tại https://2025.dvhcvn.com
- Hoặc tải về mapping [cũ → mới](mapping/splits.json), [mới → cũ](mapping/merges.json)

## Nguồn dữ liệu

- Danh sách các đơn vị hành chính trước 1/7: [dvhcvn](https://github.com/daohoangson/dvhcvn/blob/v20250301/data/sorted.json)
- Nghị quyết 60-NQ/TW: sáp nhập còn 34 tỉnh / thành phố
- Công văn 915/CTK-CSCL: mã số cấp tỉnh
- Công văn 1027/CTK-CSCL: mã số cấp xã
- Các nghị quyết từ 1654/NQ-UBTVQH15 tới 1687/NQ-UBTVQH15 về việc sắp xếp xã của từng tỉnh

Không rõ vì sao một số văn bản không tìm thấy trên https://chinhphu.vn, những cái tìm thấy thì toàn file PDF ảnh nên mình phải tải về từ https://thuvienphapluat.vn sau đó dùng các công cụ như [marker](https://github.com/datalab-to/marker), [pandoc](https://pandoc.org) hoặc [soffice](https://www.libreoffice.org) để chuyển về markdown, CSV. Bạn có thể tải các file mình đã xử lý ở trong thư mục [input/docs](input/docs) của repo này.

## Các bước xử lý

Đoạn này hơi kỹ thuật một tí nhé. Cơ bản là mình prompt cho coding agent nó làm là chính (mình xài [Codebuff](https://www.codebuff.com), ngó qua prompts và scripts ở branch [này](https://github.com/dvhcvn/20250701/tree/codebuff)).

### Bước 1: Tiền xử lý

- Tải `sorted.json` rồi chế cháo thành file `tmp/old.json` với 63 tỉnh, 5 huyện và 10,047 xã (đơn vị hành chính cũ)
- Đọc file `915_CTK-CSCL.csv` và `1027_CTK-CSCL.md` để tạo file `tmp/new.json` với 34 tỉnh và khoảng 3321 xã (đơn vị hành chính mới)
- Đọc 34 file nghị quyết để trích xuất các điều, khoản ra file `tmp/resolutions.json`

### Bước 2: Xử lý

Với mỗi đơn vị cũ, tìm nghị quyết và đơn vị mới tương ứng bằng:

- Tìm các nghị quyết liên quan
- Tìm các đơn vị mới được đề cập trong nghị quyết
- Tiếng Việt có dấu nên mình normalize một chút, chấp nhận lấy thừa dữ liệu còn hơn bỏ sót
- Nếu prompt dài quá thì mình xài `gemini-2.5-pro`, còn không thì về `gemini-2.5-flash` cho nhanh + rẻ hơn xíu
- Gemini sẽ trả về JSON với citation, confidence, và các đơn vị mới

Thực ra lúc đầu mình làm đơn giản hơn là nhét hết tất cả nghị quyết và đơn vị mới vào một cái prompt siêu to khổng lồ (khoảng 400k tokens), dự định sẽ xài [context caching](https://ai.google.dev/gemini-api/docs/caching) kết hợp với [batch processing](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini) nhưng chạy thử thì thấy kết quả hay trả về lộn mã đơn vị của hàng xóm...

Do mỗi xã chạy cũng khá lâu (flash ~10s, pro có khi >20s) nên mình cho chạy hẳn 50 workers, theo dõi thấy nếu [usage tier 2](https://ai.google.dev/gemini-api/docs/rate-limits#usage-tiers) thì cũng không dính rate limit gì cả, 20 phút là xong, mất khoảng $50.

### Bước 3: Hậu kiểm

- Scan tất cả file JSON trong thư mục `output/`
- Validate schema và kiểm tra tính nhất quán của dữ liệu:
  - Citation phải chứa tên đơn vị (cả cũ và mới), ví dụ nếu là file của `Cửa Nam` và đang ghi nhận là sẽ sáp nhập vào `Hoàn Kiếm` thì cái câu điều khoản từ nghị quyết phải chứa cả hai từ này
  - Result của xã phải ghi nhận nghị quyết của UBTVQH
  - Result của xã phải ghi nhận nghị quyết 60-NQ/TW
  - Nếu confidence thấp thì phải kiểm tra thủ công
- Xóa file có lỗi để chạy lại, hên hên thì lần 2 sẽ ra kết quả đúng
- Một số trường hợp tên sai chính tả hoặc số la mã thì phải sửa tay (khoảng 80 nhát)
- Kiểm tra completeness: tất cả đơn vị mới phải có trong output
- Kiểm tra chéo với dữ liệu từ http://sapnhap.bando.com.vn

## Nguồn tham khảo

- https://github.com/daohoangson/dvhcvn
- https://address-converter.io.vn
- https://doidiachi.net
- https://ezenglishapp.com/chuyen-doi-dia-chi
- https://sapnhap.bando.com.vn
- https://tinhthanhpho.com/convert
- https://tracuuphuongxa.trolyao.org
- https://don-vi-hanh-chinh.vercel.app
