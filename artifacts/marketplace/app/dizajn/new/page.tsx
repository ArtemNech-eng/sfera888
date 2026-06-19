import { redirect } from "next/navigation";

/**
 * Старая waitlist-страница `/dizajn/new` устарела — после Iter 1 AI-дизайнера
 * upload-форма живёт прямо в `/dizajn`. Этот файл оставлен только для
 * обратной совместимости со старыми ссылками — 308 redirect на `/dizajn`.
 */

export default function DesignerNewRedirect() {
  redirect("/dizajn");
}
