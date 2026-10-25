-- directory_public_settings mutates app.user_id via set_config; must be VOLATILE (اجرای ۷).

ALTER FUNCTION "social"."directory_public_settings"(uuid) VOLATILE;
