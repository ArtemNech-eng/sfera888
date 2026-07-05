# Requirements Document

## Introduction

Публикация в сообществе «ХочуТакже» сегодня открывается на уровне доступа 3 (Requirement 11 родительского спека `hochu-takzhe-community`) через **Phone_Verification** — подтверждение телефона одноразовым кодом (SMS). SMS-провайдер в проекте отсутствует, поэтому доставка кода не работает и **вся публикация в сообществе заблокирована**.

Данная фича заменяет SMS-гейт на **форумную регистрацию по паролю**: телефон выступает логином, а доступ подтверждается паролем (bcryptjs-хеш), как это уже сделано для мастеров (`masters.pwa_login` / `masters.pwa_password_hash`, `POST /api/master-pwa/login {login, password}`) и операторов (`users.login` / `users.password_hash`, `POST /api/auth/login`). Регистрация защищается уже интегрированной SmartCaptcha (`smartCaptcha.ts` / `verifyCaptchaToken`) и rate-limiting (`createRateLimiter`). Анти-спам без подтверждения телефона обеспечивается связкой «SmartCaptcha при регистрации + ограничение частоты запросов + существующий `Moderation_Service` для постов».

Право публикации (гейт уровня 3, предикат `hasPublishingRights`) обобщается с «телефон подтверждён» (`phone_verified_at != null`) до «учётная запись зарегистрирована» (задан пароль). Существующие аккаунты, у которых уже проставлен `phone_verified_at`, сохраняют право публикации без изменений (обратная совместимость).

Сессия повторяет модель мастеров/операторов: `express-session` (cookie `connect.sid`, таблица `sessions` в Postgres), в сессии хранится идентификатор Community_Account; веб-фасад устанавливает контекст аккаунта через сессию вместо текущего заголовка `X-Community-Account-Id`.

### Вне области действия (Out of Scope)

- Доставка SMS и любые SMS-провайдеры.
- Доставка кодов через Telegram/MAX; привязка MAX остаётся опциональной, как сегодня (`link-max`), и не является условием публикации.
- Восстановление/сброс пароля (по email или SMS) — отдельный будущий этап; в данной фиче не реализуется.
- Любые изменения аутентификации мастеров (`master-pwa`) и операторов (CRM `users`).

## Glossary

- **Community_Auth_Service**: серверный сервис аутентификации сообщества, реализующий регистрацию, вход, выход и предикат прав публикации для Community_Account (обобщение существующего `communityAuth.ts`).
- **Community_Account**: облегчённая учётная запись сообщества (`community_accounts`), идентифицируемая телефоном; для публикации требует заданного пароля.
- **Phone**: телефонный номер, выступающий логином Community_Account; уникален в пределах `community_accounts`.
- **Normalized_Phone**: телефон, приведённый к каноническому формату `+7XXXXXXXXXX` правилами `normalizeRuPhone` (только цифры; ведущая `8` при 11 цифрах → `7`; 10 цифр → префикс `7`; результат — ровно 11 цифр с кодом страны `7`).
- **Password**: секрет, задаваемый пользователем при регистрации и предъявляемый при входе.
- **Password_Hash**: bcryptjs-хеш Password (`community_accounts.password_hash`), единственная хранимая форма Password.
- **Password_Policy**: правило допустимости Password — длина от 8 до 72 символов включительно.
- **Captcha**: Yandex SmartCaptcha; серверная проверка токена через `verifyCaptchaToken` (`smartCaptcha.ts`).
- **Registration_Rate_Limiter**: ограничитель частоты запросов регистрации по IP (паттерн `createRateLimiter`).
- **Login_Rate_Limiter**: ограничитель частоты запросов входа по IP (паттерн `createRateLimiter`).
- **Publishing_Rights**: право публикации в сообществе (гейт уровня 3), выражаемое чистым предикатом состояния Community_Account.
- **Community_Session**: сессия `express-session` (cookie `connect.sid`, таблица `sessions` в Postgres), хранящая идентификатор аутентифицированного Community_Account.
- **Web_Facade**: публичный веб-фасад marketplace (Next.js 15 App Router), предоставляющий формы регистрации и входа сообщества и устанавливающий Community_Session.
- **Legacy_Verified_Account**: Community_Account, созданный до данной фичи, у которого проставлен `phone_verified_at` (был подтверждён по SMS-коду), но не задан Password.
- **Max_Login**: опциональная привязка Max как бонус; не является условием Publishing_Rights (сохраняется поведение Requirement 11.2 родительского спека).

## Requirements

### Requirement 1: Регистрация Community_Account по телефону и паролю

**User Story:** Как житель или мастер без учётной записи, я хочу зарегистрироваться по телефону и паролю, пройдя капчу, чтобы получить право публикации без SMS-подтверждения.

#### Acceptance Criteria

1. WHEN пользователь отправляет регистрацию с Normalized_Phone, отсутствующим в `community_accounts`, Password длиной от 8 до 72 символов включительно (Password_Policy) и Captcha-токеном, успешно прошедшим серверную проверку через `verifyCaptchaToken`, THE Community_Auth_Service SHALL создавать ровно один Community_Account с сохранённым Password_Hash.
2. WHEN Community_Auth_Service создаёт Community_Account при регистрации, THE Community_Auth_Service SHALL сохранять Password исключительно в виде Password_Hash, вычисленного bcryptjs, и SHALL не сохранять Password в открытом виде.
3. WHEN регистрация завершена успешно, THE Community_Auth_Service SHALL устанавливать Community_Session с идентификатором созданного Community_Account.
4. WHEN регистрация завершена успешно, THE Community_Auth_Service SHALL возвращать ответ, указывающий на успешную регистрацию, содержащий данные созданного Community_Account без поля Password_Hash.
5. WHEN пользователь отправляет регистрацию с телефоном, приводимым к Normalized_Phone правилами `normalizeRuPhone` (только цифры; ведущая `8` при 11 цифрах → `7`; 10 цифр → префикс `7`; результат — ровно 11 цифр с кодом страны `7`, формат `+7XXXXXXXXXX`), THE Community_Auth_Service SHALL приводить телефон к Normalized_Phone до проверки уникальности в `community_accounts` и до сохранения Community_Account.
6. WHEN Community_Auth_Service создаёт Community_Account по успешной регистрации, THE Community_Auth_Service SHALL обеспечивать наличие Publishing_Rights у этого Community_Account с момента создания.

### Requirement 2: Отклонение регистрации при недопустимых данных

**User Story:** Как оператор платформы, я хочу, чтобы регистрация отклонялась при недопустимых данных, чтобы в системе не появлялись некорректные или дублирующие учётные записи.

#### Acceptance Criteria

1. IF телефон при регистрации не приводится к Normalized_Phone (не является валидным мобильным номером РФ, приводимым к формату «+7» и ровно 11 цифрам), THEN THE Community_Auth_Service SHALL отклонять регистрацию, не создавать Community_Account и возвращать ошибку с указанием причины «недопустимый телефон».
2. IF Password при регистрации содержит менее 8 или более 72 символов, THEN THE Community_Auth_Service SHALL отклонять регистрацию, не создавать Community_Account и возвращать ошибку с указанием причины «недопустимый пароль».
3. IF при регистрации отсутствует или является пустым хотя бы одно из обязательных полей (телефон или Password), THEN THE Community_Auth_Service SHALL отклонять регистрацию, не создавать Community_Account и возвращать ошибку с указанием причины «отсутствует обязательное поле».
4. IF Normalized_Phone при регистрации уже присутствует в `community_accounts`, THEN THE Community_Auth_Service SHALL отклонять регистрацию, не создавать второй Community_Account и возвращать ошибку с указанием причины «телефон уже зарегистрирован».
5. IF Captcha-токен при регистрации отсутствует или является пустым, THEN THE Community_Auth_Service SHALL отклонять регистрацию без выполнения серверной проверки Captcha, не создавать Community_Account и возвращать ответ, предлагающий повторить проверку Captcha.
6. IF Captcha-токен при регистрации присутствует, но не проходит серверную проверку, THEN THE Community_Auth_Service SHALL отклонять регистрацию, не создавать Community_Account и возвращать ответ, предлагающий повторить проверку Captcha.
7. IF серверная проверка Captcha не может быть выполнена (сервис проверки недоступен или не отвечает в течение 10 секунд), THEN THE Community_Auth_Service SHALL отклонять регистрацию, не создавать Community_Account и возвращать ошибку с указанием причины «проверка Captcha недоступна», предлагая повторить попытку.
8. IF регистрация отклонена по любой причине, THEN THE Community_Auth_Service SHALL не устанавливать Community_Session и не сохранять частично созданный Community_Account.

### Requirement 3: Вход по телефону и паролю

**User Story:** Как зарегистрированный участник, я хочу входить по телефону и паролю, чтобы возобновлять сессию публикации на любом устройстве.

#### Acceptance Criteria

1. WHEN пользователь отправляет вход с Normalized_Phone существующего Community_Account и паролем, чей проверенный bcryptjs результат совпадает с Password_Hash этого Community_Account, THE Community_Auth_Service SHALL устанавливать Community_Session с идентификатором этого Community_Account.
2. WHEN вход завершён успешно, THE Community_Auth_Service SHALL возвращать данные Community_Account без поля Password_Hash.
3. IF пользователь отправляет вход с телефоном, не приводящимся к Normalized_Phone, THEN THE Community_Auth_Service SHALL отклонять вход и возвращать ошибку аутентификации.
4. IF пользователь отправляет вход с Normalized_Phone, отсутствующим в `community_accounts`, THEN THE Community_Auth_Service SHALL отклонять вход, не устанавливать Community_Session и возвращать ошибку аутентификации.
5. IF пользователь отправляет вход с паролем, чей проверенный bcryptjs результат не совпадает с Password_Hash Community_Account, THEN THE Community_Auth_Service SHALL отклонять вход, не устанавливать Community_Session и возвращать ошибку аутентификации.
6. IF пользователь отправляет вход для Community_Account без заданного Password_Hash, THEN THE Community_Auth_Service SHALL отклонять вход и возвращать ошибку аутентификации.
7. WHERE вход отклонён по причине неизвестного телефона или неверного пароля, THE Community_Auth_Service SHALL возвращать единое сообщение об ошибке, не раскрывающее, какой из факторов не совпал.

### Requirement 4: Выход и жизненный цикл сессии

**User Story:** Как участник, я хочу выходить из учётной записи и полагаться на текущую сессию, чтобы контролировать доступ к публикации со своего устройства.

#### Acceptance Criteria

1. WHEN аутентифицированный участник запрашивает выход при действительной Community_Session, THE Community_Auth_Service SHALL завершать Community_Session, возвращать подтверждение успешного выхода в течение 2 секунд и после этого не предоставлять идентификатор Community_Account по этой сессии.
2. WHEN запрос содержит действительную Community_Session, THE Community_Auth_Service SHALL трактовать запрос как аутентифицированный и разрешать идентификатор аутентифицированного Community_Account из Community_Session.
3. IF запрос не содержит действительной Community_Session (Community_Session отсутствует, истёк её срок действия или она была завершена), THEN THE Community_Auth_Service SHALL трактовать запрос как неаутентифицированный и отклонять доступ к операциям, требующим аутентификации, возвращая ответ, указывающий на необходимость аутентификации.
4. WHEN участник запрашивает данные текущего Community_Account при действительной Community_Session, THE Community_Auth_Service SHALL возвращать данные Community_Account без поля Password_Hash в течение 2 секунд.
5. WHILE с момента создания Community_Session прошло не более 30 дней и Community_Session не была завершена, THE Community_Auth_Service SHALL считать эту Community_Session действительной.
6. IF участник запрашивает выход без действительной Community_Session, THEN THE Community_Auth_Service SHALL трактовать запрос как неаутентифицированный, возвращать ответ, указывающий на отсутствие активной сессии, и не изменять состояние других Community_Session.
7. IF участник запрашивает данные текущего Community_Account без действительной Community_Session, THEN THE Community_Auth_Service SHALL отклонять запрос и возвращать ответ, указывающий на необходимость аутентификации, не раскрывая данные Community_Account.

### Requirement 5: Обобщённый предикат прав публикации и обратная совместимость

**User Story:** Как владелец продукта, я хочу, чтобы право публикации давалось зарегистрированным аккаунтам и при этом сохранялось у ранее подтверждённых по SMS, чтобы разблокировать публикацию без потери доступа у существующих участников.

#### Acceptance Criteria

1. WHERE у Community_Account задан непустой Password_Hash, THE Community_Auth_Service SHALL считать, что этот Community_Account обладает Publishing_Rights.
2. WHERE у Community_Account проставлено непустое значение `phone_verified_at`, THE Community_Auth_Service SHALL считать, что этот Community_Account обладает Publishing_Rights, независимо от наличия Password_Hash.
3. IF у Community_Account одновременно не задан Password_Hash (значение отсутствует или пустое) и не проставлено значение `phone_verified_at`, THEN THE Community_Auth_Service SHALL считать, что этот Community_Account не обладает Publishing_Rights.
4. WHEN запрос на публикацию поступает от Community_Account без Publishing_Rights, THE Community_Auth_Service SHALL отклонять запрос без создания публикации и возвращать вызывающей стороне ответ с индикацией отказа по причине отсутствия Publishing_Rights.
5. IF при обработке запроса на публикацию наличие Publishing_Rights не удаётся определить, THEN THE Community_Auth_Service SHALL отклонять запрос без создания публикации и возвращать вызывающей стороне ответ с индикацией отказа.
6. THE Community_Auth_Service SHALL не использовать Max_Login в качестве условия определения Publishing_Rights.

### Requirement 6: Безопасность хранения пароля

**User Story:** Как ответственный за безопасность, я хочу, чтобы пароли хранились только в виде хеша и никогда не покидали сервер, чтобы утечка данных не раскрывала учётные данные участников.

#### Acceptance Criteria

1. WHEN Community_Auth_Service сохраняет Community_Account, THE Community_Auth_Service SHALL сохранять Password исключительно в виде Password_Hash, вычисленного bcryptjs с коэффициентом трудоёмкости (cost factor) не менее 10, и SHALL не сохранять и не передавать Password в открытом виде ни в одно хранилище данных.
2. WHEN Community_Auth_Service формирует любой HTTP-ответ, содержащий данные Community_Account (включая успешные ответы, ответы об ошибках и сообщения валидации), THE Community_Auth_Service SHALL исключать поле Password_Hash из тела ответа.
3. WHEN участник предъявляет Password при входе, THE Community_Auth_Service SHALL проверять его сравнением с сохранённым Password_Hash средствами bcryptjs и SHALL не выполнять сравнение Password в открытом виде.
4. IF предъявленный при входе Password не совпадает с Password_Hash, THEN THE Community_Auth_Service SHALL отклонить попытку входа, вернуть ответ об ошибке аутентификации без раскрытия Password и Password_Hash и сохранить существующий Password_Hash без изменений.
5. WHEN Community_Auth_Service записывает любую запись в журналы приложения (включая записи об ошибках и трассировки стека), THE Community_Auth_Service SHALL исключать значения Password и Password_Hash из содержимого записи.

### Requirement 7: Ограничение частоты регистрации и входа

**User Story:** Как оператор платформы, я хочу ограничивать частоту регистраций и входов, чтобы сдерживать перебор паролей и массовое создание учётных записей без SMS-барьера.

#### Acceptance Criteria

1. IF число запросов регистрации с одного IP-адреса достигает предела Registration_Rate_Limiter, равного 5 запросам в течение скользящего окна продолжительностью 60 минут, THEN THE Community_Auth_Service SHALL отклонять каждый последующий запрос регистрации с этого IP-адреса с кодом состояния 429.
2. IF запрос регистрации отклонён по превышению предела Registration_Rate_Limiter, THEN THE Community_Auth_Service SHALL не создавать Community_Account по этому запросу и SHALL сохранять неизменным ранее созданное состояние учётных записей.
3. IF число запросов входа с одного IP-адреса достигает предела Login_Rate_Limiter, равного 10 запросам в течение скользящего окна продолжительностью 15 минут, THEN THE Community_Auth_Service SHALL отклонять каждый последующий запрос входа с этого IP-адреса с кодом состояния 429.
4. IF запрос входа отклонён по превышению предела Login_Rate_Limiter, THEN THE Community_Auth_Service SHALL не устанавливать Community_Session по этому запросу и SHALL сохранять неизменным ранее установленное состояние сессий.
5. WHEN скользящее окно Registration_Rate_Limiter или Login_Rate_Limiter для IP-адреса истекает, THE Community_Auth_Service SHALL сбрасывать счётчик соответствующих запросов для этого IP-адреса до нуля и вновь принимать запросы с этого IP-адреса.

### Requirement 8: Формы регистрации и входа в веб-фасаде

**User Story:** Как посетитель веб-фасада, я хочу видеть формы регистрации и входа сообщества, чтобы зарегистрироваться или войти прямо на сайте.

#### Acceptance Criteria

1. THE Web_Facade SHALL предоставлять форму регистрации с полем телефона (от 10 до 15 цифр), полем пароля (от 8 до 72 символов) и виджетом Captcha.
2. THE Web_Facade SHALL предоставлять форму входа с полем телефона (от 10 до 15 цифр) и полем пароля (от 8 до 72 символов).
3. IF участник отправляет форму регистрации или входа с телефоном вне диапазона от 10 до 15 цифр или паролем вне диапазона от 8 до 72 символов, THEN THE Web_Facade SHALL отклонять отправку, отображать сообщение об ошибке с указанием недопустимого поля и не обращаться к Community_Auth_Service.
4. IF участник отправляет форму регистрации с непройденной или отсутствующей проверкой Captcha, THEN THE Web_Facade SHALL отклонять отправку и отображать сообщение об ошибке, указывающее на необходимость прохождения Captcha.
5. WHEN участник успешно проходит регистрацию или вход через Web_Facade, THE Web_Facade SHALL в течение 5 секунд устанавливать контекст аутентифицированного Community_Account через Community_Session.
6. IF Community_Auth_Service отклоняет регистрацию или вход, THEN THE Web_Facade SHALL отображать сообщение об ошибке с причиной отказа и сохранять введённые значения всех полей формы, кроме поля пароля, которое SHALL очищать.
7. WHEN участник инициирует публикацию, не имея действительной Community_Session, THE Web_Facade SHALL предлагать регистрацию или вход.
