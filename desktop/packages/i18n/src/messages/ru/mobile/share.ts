import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/mobile/share";

export const messages = {
  "mobile.share.signInTitle": "Войдите, чтобы поделиться",
  "mobile.share.signInDescription":
    "Отсканируйте QR-код в Bob на компьютере. После этого вы сможете выбрать агента, который получит то, чем вы поделились.",
  "mobile.share.reading": "Чтение того, чем вы поделились…",
  "mobile.share.readFailed": "Bob не удалось прочитать то, чем вы поделились. Поделитесь ещё раз.",
  "mobile.share.content": "Что отправить",
  "mobile.share.footer":
    "Чат откроется с этим содержимым в поле сообщения. Ничего не будет отправлено, пока вы не отправите это.",
  "mobile.share.lastUsed": "Последний использованный",
  "mobile.share.noAgents": "Нет агентов",
  "mobile.share.chooseAgent": "Выберите агента",
  "mobile.share.action": "Поделиться: {name}",
  "mobile.share.extension.send": "Отправить",
  "mobile.share.extension.footer": "Bob сейчас отправит это агенту. Приложение не откроется.",
  "mobile.share.extension.sending": "Отправка: {name}…",
  "mobile.share.extension.sent": "Отправлено: {name}",
  "mobile.share.extension.failed": "Bob не смог это отправить. Откройте приложение и отправьте оттуда.",
  "mobile.share.extension.unconfirmed": "Сервер не подтвердил сообщение. Проверьте чат, прежде чем отправлять снова.",
  "mobile.share.extension.openApp": "Открыть Bob",
} as const satisfies PartialTranslation<typeof source>;
