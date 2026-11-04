import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/server/settings";
import { getLocale, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Help & support") };
}

// The App Store / Google Play "support URL": how to reach us, and answers to the common questions.
export default async function SupportPage() {
  const s = await getSettings();
  const p = s.platformName;
  const mail = (
    <a href={`mailto:${s.supportEmail}`} className="font-semibold text-brand-600 underline">
      {s.supportEmail}
    </a>
  );
  const cls = "space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink";
  if ((await getLocale()) === "ar")
    return (
      <div className={cls}>
        <h1 className="text-2xl font-black text-ink">المساعدة والدعم</h1>
        <p>نحن هنا للمساعدة. راسلنا على {mail} ونردّ خلال يوم عمل واحد.</p>
        <h2>كيف أطلب؟</h2>
        <p>شاهد الفيديوهات أو ابحث عن طبق، اضغط «اطلب»، اختر التوصيل أو الاستلام، وأكّد طلبك. يقبل المطعم طلبك ويتواصل معك إذا لزم الأمر. الدفع نقداً عند التوصيل أو الاستلام، مباشرة للمطعم.</p>
        <h2>كيف ألغي طلباً؟</h2>
        <p>يمكنك إلغاء طلبك من صفحة الطلب قبل أن يقبله المطعم. بعد القبول، اتصل بالمطعم مباشرة من صفحة الطلب.</p>
        <h2>مشكلة في طلب؟</h2>
        <p>تواصل مع المطعم أولاً من صفحة الطلب (هاتف أو واتساب). إذا لم تُحلّ المشكلة، راسلنا مع رقم الطلب.</p>
        <h2>الإشعارات</h2>
        <p>فعّلها من الحساب ← «فعّل الإشعارات». إذا لم تصلك، تأكّد أنها مسموحة لـ {p} في إعدادات هاتفك، ثم اضغط «أرسل لي إشعاراً تجريبياً».</p>
        <h2>الإبلاغ عن محتوى أو حظره</h2>
        <p>اضغط زر الإبلاغ على أي فيديو أو تقييم أو مطعم. يمكنك أيضاً إخفاء كل محتوى مطعم أو شخص. نراجع البلاغات خلال 24 ساعة.</p>
        <h2>حذف حسابك</h2>
        <p>من الحساب ← حذف الحساب. تُحذف بياناتك الشخصية فوراً.</p>
        <h2>للمطاعم</h2>
        <p>
          سجّل مطعمك من <Link href="/business/register" className="font-semibold text-brand-600 underline">numnum.me/business/register</Link>، أو راسلنا لمساعدتك في البدء.
        </p>
        <p className="pt-2 text-sm">
          <Link href="/terms" className="underline">شروط الخدمة</Link> · <Link href="/privacy" className="underline">سياسة الخصوصية</Link>
        </p>
      </div>
    );
  return (
    <div className={cls}>
      <h1 className="text-2xl font-black text-ink">Help &amp; support</h1>
      <p>We&apos;re here to help. Email us at {mail} and we&apos;ll reply within one business day.</p>
      <h2>How do I order?</h2>
      <p>Watch reels or search for a dish, tap Order, choose delivery or pickup and confirm. The restaurant accepts your order and contacts you if needed. You pay cash on delivery or at pickup, directly to the restaurant.</p>
      <h2>How do I cancel an order?</h2>
      <p>You can cancel from the order page until the restaurant accepts it. After that, call the restaurant directly from the order page.</p>
      <h2>A problem with an order?</h2>
      <p>Contact the restaurant first from the order page (phone or WhatsApp). If it isn&apos;t solved, email us with your order number.</p>
      <h2>Notifications</h2>
      <p>Turn them on from Account → Turn on notifications. If they don&apos;t arrive, check that they&apos;re allowed for {p} in your phone&apos;s settings, then tap &quot;Send me a test notification&quot;.</p>
      <h2>Reporting or blocking content</h2>
      <p>Tap Report on any reel, review or restaurant. You can also hide everything from a restaurant or person. We review reports within 24 hours.</p>
      <h2>Deleting your account</h2>
      <p>Go to Account → Delete account. Your personal data is deleted right away.</p>
      <h2>For restaurants</h2>
      <p>
        Register your restaurant at <Link href="/business/register" className="font-semibold text-brand-600 underline">numnum.me/business/register</Link>, or email us and we&apos;ll help you get started.
      </p>
      <p className="pt-2 text-sm">
        <Link href="/terms" className="underline">Terms of service</Link> · <Link href="/privacy" className="underline">Privacy policy</Link>
      </p>
    </div>
  );
}
