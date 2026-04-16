import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  routes: {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    callback: "/api/auth/callback",
    backChannelLogout: "/api/auth/backchannel-logout"
  },
  session: {
    cookie: {
      sameSite: "none",
      secure: true
    }
  },
  transactionCookie: {
    sameSite: "none",
    secure: true
  },
  enableParallelTransactions: false
});
