.PHONY: test
test:
	yarn tslint
	yarn prettier
	yarn test
