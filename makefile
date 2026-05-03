xpi: 
	rm -f ./*.xpi
	zip -r -9 TabSearch.xpi . -x '*.git*' '*.DS_Store' '*.xpi' '*.zip' 'README.md' 'ToDo.txt' 'makefile' '*/.*' '.vscode/*' 'AMO/*' >/dev/null 2>/dev/null