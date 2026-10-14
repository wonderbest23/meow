-- 앱 인앱결제(애플·구글)를 카드 결제와 같은 결제 기록 표에 남긴다.
-- 결제 수단 값만 늘린다(기존 행은 그대로). 주문번호는 스토어 거래 번호(IAP-A-…, IAP-G-…)라 같은 영수증은 한 번만 들어간다.
alter table public.payment_orders drop constraint if exists payment_orders_method_check;
alter table public.payment_orders add constraint payment_orders_method_check
  check (method in ('CARD', 'TOSSPAY', 'TRANSFER', 'APPLE_IAP', 'GOOGLE_IAP'));
