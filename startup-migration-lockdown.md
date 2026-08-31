# Railway startup lockdown

Railway application startup must use `npm start` only. Database migrations are deployment operations and must not be executed implicitly by the web-process start command.
