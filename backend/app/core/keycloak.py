from functools import lru_cache

from keycloak import KeycloakAdmin, KeycloakOpenID

from app.core.config import get_settings


def get_keycloak_admin() -> KeycloakAdmin:
    """
    Return a fresh KeycloakAdmin instance on every call.

    DO NOT cache this with @lru_cache.  KeycloakAdmin internally stores a
    short-lived admin access-token and re-uses it.  When that token expires
    the cached instance starts raising 401 errors on every admin API call
    without ever trying to re-authenticate.  A fresh instance authenticates
    lazily on first use, which is always correct.
    """
    settings = get_settings()
    return KeycloakAdmin(
        server_url=settings.normalized_keycloak_url,
        realm_name=settings.keycloak_realm,
        # user_realm_name controls which realm the admin *credentials* live in.
        # Keycloak ships with a built-in "admin-cli" client only in "master",
        # so keep this as "master" unless you have created admin users inside
        # the application realm and configured a separate admin-cli there.
        user_realm_name=settings.keycloak_admin_realm,
        client_id="admin-cli",
        username=settings.keycloak_admin_username,
        password=settings.keycloak_admin_password,
        verify=settings.keycloak_verify_ssl,
    )


@lru_cache
def get_keycloak_openid() -> KeycloakOpenID:
    """
    KeycloakOpenID is safe to cache: it holds no mutable session state.
    Token operations (token(), refresh_token(), decode_token()) are all
    stateless HTTP calls; the instance itself is just configuration.
    """
    settings = get_settings()
    return KeycloakOpenID(
        server_url=settings.normalized_keycloak_url,
        realm_name=settings.keycloak_realm,
        client_id=settings.keycloak_client_id,
        client_secret_key=settings.keycloak_client_secret,
        verify=settings.keycloak_verify_ssl,
    )
