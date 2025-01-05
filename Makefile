NAME=activitywatch-status
DOMAIN=cweiske.de

.PHONY: all pack install clean

$(NAME).zip:
	mkdir dist
	cp extension.js metadata.json stylesheet.css README.rst dist/
	@(cd dist && zip ../$(NAME).zip -9r .)

pack: $(NAME).zip

install: $(NAME).zip
	touch ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	rm -rf ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	mv dist ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)

clean:
	rm -rf dist $(NAME).zip
