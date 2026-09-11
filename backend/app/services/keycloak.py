from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings

settings = get_settings()


class KeycloakService:
    async def password_login(self, username: str, password: str) -> dict:
        return await self._token_request(
            {
                "grant_type": "password",
                "client_id": settings.keycloak_client_id,
                "client_secret": settings.keycloak_client_secret,
                "username": username,
                "password": password,
                "scope": "openid profile email",
            },
            invalid_detail="Invalid username/email or password",
        )

    async def refresh(self, refresh_token: str) -> dict:
        return await self._token_request(
            {
                "grant_type": "refresh_token",
                "client_id": settings.keycloak_client_id,
                "client_secret": settings.keycloak_client_secret,
                "refresh_token": refresh_token,
            },
            invalid_detail="Your session has expired. Please sign in again.",
        )

    async def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        async with httpx.AsyncClient(timeout=20) as client:
            await client.post(
                settings.keycloak_logout_url,
                data={
                    "client_id": settings.keycloak_client_id,
                    "client_secret": settings.keycloak_client_secret,
                    "refresh_token": refresh_token,
                },
            )

    async def register_user(
        self,
        username: str,
        email: str,
        password: str,
        first_name: str | None,
        last_name: str | None,
    ) -> None:
        admin_token = await self._service_account_token()

        payload = {
            "username": username,
            "email": email,
            "firstName": first_name or "",
            "lastName": last_name or "",
            "enabled": True,
            "emailVerified": False,
            "credentials": [
                {
                    "type": "password",
                    "value": password,
                    "temporary": False,
                }
            ],
        }

        headers = {"Authorization": f"Bearer {admin_token}"}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                settings.keycloak_admin_users_url,
                json=payload,
                headers=headers,
            )

            if response.status_code == 409:
                raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already exists")
            if response.status_code not in {201, 204}:
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY,
                    f"Identity service could not create the account: {response.text}",
                )

            location = response.headers.get("Location", "")
            user_id = location.rstrip("/").split("/")[-1]
            if not user_id:
                lookup = await client.get(
                    settings.keycloak_admin_users_url,
                    params={"username": username, "exact": "true"},
                    headers=headers,
                )
                lookup.raise_for_status()
                users = lookup.json()
                if not users:
                    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Identity account was created but could not be resolved")
                user_id = users[0]["id"]

            role_response = await client.get(
                f"{settings.keycloak_admin_roles_url}/user",
                headers=headers,
            )
            if role_response.status_code != 200:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The default user role is not configured in Keycloak")

            assignment = await client.post(
                f"{settings.keycloak_admin_users_url}/{quote(user_id)}/role-mappings/realm",
                json=[role_response.json()],
                headers=headers,
            )
            if assignment.status_code not in {204, 201}:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not assign the user role")

    async def create_user_by_admin(
        self,
        username: str,
        email: str,
        password: str,
        role: str,
    ) -> None:
        await self.register_user(username, email, password, None, None)
        if role == "admin":
            await self.assign_realm_role(username, "admin")

    async def assign_realm_role(self, username: str, role_name: str) -> None:
        admin_token = await self._service_account_token()
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with httpx.AsyncClient(timeout=30) as client:
            user_response = await client.get(
                settings.keycloak_admin_users_url,
                params={"username": username, "exact": "true"},
                headers=headers,
            )
            user_response.raise_for_status()
            users = user_response.json()
            if not users:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "User was not found in Keycloak")

            role_response = await client.get(
                f"{settings.keycloak_admin_roles_url}/{role_name}",
                headers=headers,
            )
            role_response.raise_for_status()

            mapping_response = await client.post(
                f"{settings.keycloak_admin_users_url}/{users[0]['id']}/role-mappings/realm",
                json=[role_response.json()],
                headers=headers,
            )
            if mapping_response.status_code not in {204, 201}:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not assign the requested role")

    async def _service_account_token(self) -> str:
        token = await self._token_request(
            {
                "grant_type": "client_credentials",
                "client_id": settings.keycloak_client_id,
                "client_secret": settings.keycloak_client_secret,
            },
            invalid_detail="The backend identity client is not configured correctly",
        )
        return token["access_token"]

    async def _token_request(self, data: dict, invalid_detail: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(settings.keycloak_token_url, data=data)
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Keycloak is currently unavailable") from exc

        if response.status_code != 200:
            if response.status_code in {400, 401}:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, invalid_detail)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"Identity service error: {response.text}",
            )
        return response.json()


keycloak_service = KeycloakService()
