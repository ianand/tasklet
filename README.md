tasklet
=======

Syncs Google Tasks to events on your Google Calendar


INSTALL
-------

* Only runs on Google Apps Script platform

* Make sure to enable the Google Tasks API from the Google Developer Console
AND from the Resources > Advanced Google Services menu in the script editor.

* Make sure to enable the Google Calendar API from the Google Developer Console
AND from the Resources > Google Advanced Services menu in the script editor.

* To execute, run the main() function from the Script Editor menu.

IMPLEMENTATION NOTES
--------------------

* Execution should start with the main() function.

* Google Tasks' data model has no field for time estimates (aka task duration). We
store this in the task.notes field in the form XXmins or YYhours. See regex in 
Helper.parseTimeEstimateString for precise format.

* Google calendar and tasks use date strings in RFC 3339 timestamp. There are functions
in the Helper object for dealing with this format.

LICENSE
-------

Copyright (C) 2014 Ishan Anand

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
