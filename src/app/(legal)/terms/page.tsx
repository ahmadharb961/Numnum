import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { getLocale, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Terms of service") };
}

export default async function TermsPage() {
  const s = await getSettings();
  const p = s.platformName;
  if ((await getLocale()) === "ar")
    return (
      <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
        <h1 className="text-2xl font-black text-ink">شروط الخدمة</h1>
        <h2>الخدمة</h2>
        <p>يساعدك {p} على اكتشاف أكل المطاعم المستقلة والطلب منها أونلاين. المطعم — وليس {p} — هو من يقبل طلبك ويحضّر أكلك ويوصّله ويحصّل المبلغ. طريقة الدفع الوحيدة هي <b>الدفع نقداً عند التوصيل</b> (أو نقداً عند الاستلام)، مباشرة للمطعم. يتأكد طلبك عندما يقبله المطعم، ويمكنك إلغاؤه قبل ذلك.</p>
        <h2>الأسعار والمعلومات</h2>
        <p>تقدّم المطاعم القوائم والأسعار والمكوّنات ومعلومات مسبّبات الحساسية. نحن لا نستنتج المكوّنات أو مسبّبات الحساسية من الصور. إذا كانت لديك حساسية، تأكّد من المطعم قبل الطلب. يحدّد كل مطعم رسوم التوصيل وتظهر قبل إرسال طلبك.</p>
        <h2>التقييمات والمحتوى</h2>
        <p>يجب أن تعكس التقييمات تجارب حقيقية. قد نُخفي أو نزيل المحتوى المزيّف أو المسيء أو المضلّل أو المخالف، وفق قواعد المراجعة لدينا. تؤكد شارة التوثيق هوية المطعم كمؤسسة، وليست تقييماً لجودة الأكل. يتم تمييز المحتوى المموَّل.</p>
        <h2>المطاعم</h2>
        <p>توافق المطاعم على اتفاقية العمولة، وعلى إبقاء معلومات القائمة دقيقة، واستخدام بيانات الزبائن لتنفيذ الطلبات فقط.</p>
        <h2>المسؤولية</h2>
        <p>{p} ليس طرفاً في عملية البيع بينك وبين المطعم، وغير مسؤول عن جودة الأكل أو تحضيره أو توصيله أو أي خلاف على الدفع، ويجب حلّ ذلك مع المطعم. تواصل مع {s.supportEmail} للإبلاغ عن مشكلة.</p>
      </div>
    );
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
      <h1 className="text-2xl font-black text-ink">Terms of service</h1>
      <h2>The service</h2>
      <p>{p} helps you discover food from independent restaurants and order from them online. The restaurant — not {p} — accepts your order, prepares and delivers your food, and collects payment. The only payment method is <b>cash on delivery</b> (or cash at pickup), paid directly to the restaurant. Your order is confirmed once the restaurant accepts it; you can cancel it until then.</p>
      <h2>Prices & information</h2>
      <p>Menus, prices, ingredients and allergen information are provided by restaurants. We do not infer ingredients or allergens from images. If you have an allergy, confirm with the restaurant before ordering. Delivery fees are set by each restaurant and shown before you place your order.</p>
      <h2>Reviews & content</h2>
      <p>Reviews must reflect genuine experiences. We may hide or remove content that is fake, abusive, misleading or infringing, under our moderation rules. The verified badge confirms a restaurant&apos;s business identity, not food quality. Sponsored content is labeled.</p>
      <h2>Restaurants</h2>
      <p>Restaurants agree to the commission agreement, to keep menu information accurate, and to handle customer data only to fulfill orders.</p>
      <h2>Liability</h2>
      <p>{p} is not a party to the sale between you and the restaurant and is not responsible for food quality, preparation, delivery or payment disputes, which should be resolved with the restaurant. Contact {s.supportEmail} to report a problem.</p>
    </div>
  );
}
