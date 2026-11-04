import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { getLocale, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Privacy policy") };
}

export default async function PrivacyPage() {
  const s = await getSettings();
  const p = s.platformName;
  if ((await getLocale()) === "ar")
    return (
      <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
        <h1 className="text-2xl font-black text-ink">سياسة الخصوصية</h1>
        <p>توضح هذه السياسة ما يجمعه {p} (الموقع وتطبيقات iPhone وAndroid) ولماذا وكيف تتم مشاركته. {p} خدمة لاكتشاف الأكل والطلب من المطاعم؛ نحن لا نعالج المدفوعات ولا نوصّل الأكل.</p>
        <h2>التصفّح</h2>
        <p>يمكنك مشاهدة الفيديوهات وتصفّح القوائم دون حساب. نضع معرّفاً عشوائياً ومجهولاً لجهازك لاحتساب المشاهدات بعدل ومنع الطلبات المكرّرة. لا يُستخدم لتتبّعك على مواقع أو تطبيقات أخرى، ولا نعرض إعلانات ولا نبيع بياناتك.</p>
        <h2>حسابك</h2>
        <p>لإرسال طلب أو الإعجاب أو الحفظ أو كتابة تقييم أو الإبلاغ، تحتاج إلى حساب. نحفظ اسمك وبريدك الإلكتروني وكلمة مرور مشفّرة ورقم هاتفك المحمول ولغتك المفضّلة وعناوين التوصيل المحفوظة وسجل طلباتك وإعجاباتك ومحفوظاتك وتقييماتك. تُظهر التقييمات اسمك الأول فقط.</p>
        <h2>إرسال طلب</h2>
        <p>عندما ترسل طلباً، تتم مشاركة اسمك ورقم هاتفك، وللتوصيل عنوانك وموقعك على الخريطة، <b>فقط مع المطعم الذي طلبت منه</b> ليحضّر الطلب ويوصّله ويتواصل معك بشأنه (بالهاتف أو واتساب). لا تُعرض علناً ولا تُشارك مع مطاعم أخرى. الدفع نقداً عند التوصيل؛ لا نجمع أي بيانات بطاقات.</p>
        <h2>الموقع</h2>
        <p>بإذنك، نستخدم موقع جهازك لعرض المطاعم التي توصّل إليك ورسوم التوصيل، ولتحديد عنوان التوصيل على الخريطة. يمكنك اختيار منطقة أو تحديد نقطة على الخريطة بدلاً من ذلك. لا نتتبّع موقعك في الخلفية.</p>
        <h2>الإشعارات</h2>
        <p>إذا فعّلت الإشعارات، نحفظ معرّف الإشعارات الخاص بجهازك (من Apple أو Google أو متصفحك) لنرسل لك تحديثات طلباتك، وللمطاعم الطلبات الجديدة، وأحياناً أخبار {p}. يمكنك إيقافها في أي وقت من إعدادات هاتفك.</p>
        <h2>المطاعم</h2>
        <p>تقدّم حسابات المطاعم تفاصيل المؤسسة والقوائم والصور والفيديوهات ومعلومات الفوترة. يُستخدم إذن الكاميرا والصور فقط عندما يضيف المطعم فيديو أو صورة. تُحفظ إيصالات الدفع ومستندات التوثيق بشكل خاص ولا يراها إلا مالك المطعم ومشرفو {p}.</p>
        <h2>الإبلاغ والحظر</h2>
        <p>عندما تبلّغ عن محتوى أو تحظر مطعماً أو شخصاً، نحفظ ذلك مع حسابك لإخفاء المحتوى عنك ولمراجعة البلاغات خلال 24 ساعة.</p>
        <h2>الإحصاءات</h2>
        <p>نسجّل أحداث تفاعل (المشاهدات والإعجابات والمشاركات وفتح الأطباق والإضافة إلى السلة والطلبات) لترتيب الفيديوهات وتقديم إحصاءات للمطاعم. تُعرض للمطاعم كأرقام إجمالية فقط.</p>
        <h2>حذف حسابك</h2>
        <p>يمكنك حذف حسابك في أي وقت من الحساب ← حذف الحساب. تُحذف بياناتك الشخصية فوراً، وتبقى الطلبات السابقة لدى المطاعم لسجلاتها المحاسبية دون اسمك أو هاتفك أو عنوانك.</p>
        <h2>التواصل</h2>
        <p>للأسئلة أو الطلبات: {s.supportEmail}</p>
      </div>
    );
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
      <h1 className="text-2xl font-black text-ink">Privacy policy</h1>
      <p>This policy explains what {p} (the website and the iPhone and Android apps) collects, why, and how it is shared. {p} is a food discovery and ordering service; we do not process payments or deliver food.</p>
      <h2>Browsing</h2>
      <p>You can watch reels and browse menus without an account. We set a random, anonymous device identifier to count video views fairly and prevent duplicate orders. It is not used to track you on other websites or apps; we show no ads and never sell your data.</p>
      <h2>Your account</h2>
      <p>An account is needed to place an order, like, save, review or report. We store your name, email, a hashed password, your mobile number, your preferred language, saved delivery addresses, your order history, likes, saved items and reviews. Reviews show your first name only.</p>
      <h2>Placing an order</h2>
      <p>
        When you place an order, your name, phone number and — for delivery — your address and map location are shared <b>only with the restaurant you ordered from</b>, so they can prepare and deliver it and contact you about it (by phone or WhatsApp). They are never shown publicly or shared with other restaurants. Payment is cash on delivery; we never collect card details.
      </p>
      <h2>Location</h2>
      <p>With your permission, we use your device location to show restaurants that deliver to you and their delivery fees, and to pin your delivery address on the map. You can choose an area or drop a pin instead. We never track your location in the background.</p>
      <h2>Notifications</h2>
      <p>If you turn notifications on, we store your device&apos;s notification token (from Apple, Google or your browser) to send you order updates, new orders to restaurants, and occasional news from {p}. You can turn them off at any time in your phone&apos;s settings.</p>
      <h2>Restaurants</h2>
      <p>Restaurant accounts provide business details, menus, photos, videos and billing information. Camera and photo access is only used when a restaurant adds a reel or a photo. Payment receipts and verification documents are stored privately and visible only to the restaurant owner and {p} administrators.</p>
      <h2>Reports and blocks</h2>
      <p>When you report content or block a restaurant or person, we keep that with your account to hide the content from you and to review reports within 24 hours.</p>
      <h2>Analytics</h2>
      <p>We record engagement events (views, likes, shares, dish opens, add-to-cart and orders placed) to rank the feed and give restaurants statistics. Restaurants only see them as totals.</p>
      <h2>Deleting your account</h2>
      <p>You can delete your account at any time from Account → Delete account. Your personal data is deleted right away; past orders stay with the restaurants for their accounting records, without your name, phone or address.</p>
      <h2>Contact</h2>
      <p>Questions or requests: {s.supportEmail}</p>
    </div>
  );
}
