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
        <p>توضح هذه السياسة ما يجمعه {p} ولماذا وكيف تتم مشاركته. {p} خدمة لاكتشاف الأكل؛ نحن لا نعالج المدفوعات ولا نوصّل الأكل.</p>
        <h2>التصفّح بدون حساب</h2>
        <p>يمكنك مشاهدة الفيديوهات وتصفّح القوائم والطلب دون تسجيل. نضع ملف تعريف ارتباط عشوائياً ومجهولاً للجهاز لاحتساب المشاهدات بعدل، وتذكّر الإعجابات والمحفوظات على جهازك، ومنع الطلبات المكرّرة. لا يُستخدم لتتبّعك على مواقع أخرى.</p>
        <h2>إرسال طلب</h2>
        <p>عندما ترسل طلباً، تقدّم اسمك ورقم هاتفك، وللتوصيل عنوانك وموقعك على الخريطة اختيارياً. تتم مشاركة هذه المعلومات <b>فقط مع المطعم الذي طلبت منه</b> ليحضّر الطلب ويوصّله ويتواصل معك بشأنه. لا تُعرض علناً أبداً ولا تُشارك مع مطاعم أخرى. الدفع نقداً عند التوصيل؛ لا نجمع أي بيانات بطاقات.</p>
        <p>تُحفظ سلتك في متصفحك. لا تُحفظ تفاصيل التوصيل على جهازك إلا إذا اخترت «تذكّر معلوماتي».</p>
        <h2>الموقع</h2>
        <p>لا نصل إلى موقع جهازك إلا عندما تضغط «استخدم موقعي» عند إتمام الطلب، وفقط لإنشاء رابط خريطة للمطعم. يمكنك لصق رابط Google Maps بدلاً من ذلك.</p>
        <h2>الحسابات الاختيارية</h2>
        <p>إذا أنشأت حساباً، نحفظ اسمك وبريدك الإلكتروني وكلمة مرور مشفّرة ورقم هاتفك وعناوين التوصيل المحفوظة وسجل طلباتك ولغتك المفضّلة. الطلبات التي أرسلتها كزائر من الجهاز نفسه تُضاف إلى حسابك عند تسجيل الدخول. تُظهر التقييمات اسمك الأول فقط.</p>
        <h2>المطاعم</h2>
        <p>تقدّم حسابات المطاعم تفاصيل المؤسسة والقوائم والوسائط ومعلومات الفوترة. تُحفظ إيصالات الدفع ومستندات التوثيق بشكل خاص ولا يراها إلا مالك المطعم ومشرفو {p}.</p>
        <h2>الإحصاءات</h2>
        <p>نسجّل أحداث تفاعل إجمالية (المشاهدات والإعجابات والمشاركات وفتح الأطباق والإضافة إلى السلة والطلبات) لترتيب الفيديوهات وتقديم إحصاءات للمطاعم. هذه الأحداث غير مرتبطة بهويتك.</p>
        <h2>الاحتفاظ بالبيانات</h2>
        <p>نحتفظ بسجلات الطلبات لمحاسبة العمولات وحل الاعتراضات، ثم تُحذف بيانات تواصل الزبون أو تُجعل مجهولة حسب جدول الاحتفاظ لدينا. يمكنك أن تطلب منا حذف حسابك وبياناتك الشخصية في أي وقت.</p>
        <h2>التواصل</h2>
        <p>للأسئلة أو طلبات الحذف: {s.supportEmail}</p>
      </div>
    );
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
      <h1 className="text-2xl font-black text-ink">Privacy policy</h1>
      <p>This policy explains what {p} collects, why, and how it is shared. {p} is a food discovery service; we do not process payments or deliver food.</p>
      <h2>Browsing without an account</h2>
      <p>You can watch reels, browse menus and order without registering. We set a random, anonymous device identifier cookie to count video views fairly, remember likes and saved items on your device, and prevent duplicate orders. It is not used to track you on other websites.</p>
      <h2>Placing an order</h2>
      <p>
        When you place an order, you provide your name, phone number, and — for delivery — your address and optionally your map location. This information is shared <b>only with the restaurant you ordered from</b> so they can prepare, deliver and contact you about the order. It is never shown publicly or shared with other restaurants. Payment is cash on delivery; we never collect card details.
      </p>
      <p>Your cart is stored in your browser. Your delivery details are only remembered on your device if you tick “Remember my details”.</p>
      <h2>Location</h2>
      <p>We only access your device location when you tap “Use my location” at checkout, and only to create a map link for the restaurant. You can paste a Google Maps link instead.</p>
      <h2>Optional accounts</h2>
      <p>If you create an account, we store your name, email, a hashed password, your phone number, your saved delivery addresses and your order history. Orders you placed as a guest on the same device are added to your account when you sign in. Reviews show your first name only.</p>
      <h2>Restaurants</h2>
      <p>Restaurant accounts provide business details, menus, media and billing information. Payment receipts and verification documents are stored privately and visible only to the restaurant owner and {p} administrators.</p>
      <h2>Analytics</h2>
      <p>We record aggregate engagement events (views, likes, shares, product opens, add-to-cart and orders placed) to rank the feed and provide restaurant statistics. These events are not linked to your identity.</p>
      <h2>Retention</h2>
      <p>Order records are kept for commission accounting and dispute resolution, then customer contact details are deleted or anonymized according to our retention schedule. You can ask us to delete your account and associated personal data at any time.</p>
      <h2>Contact</h2>
      <p>Questions or deletion requests: {s.supportEmail}</p>
    </div>
  );
}
