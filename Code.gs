
/*

Tasklet - Syncs Google Tasks to events on your Google Calendar

---INSTALL---

* Only runs on Google Apps Script platform

* Make sure to enable the Google Tasks API from the Google Developer Console
AND from the Resources > Advanced Google Services menu in the script editor.

* Make sure to enable the Google Calendar API from the Google Developer Console
AND from the Resources > Google Advanced Services menu in the script editor.

* To execute, run the main() function from the Script Editor menu.

---IMPLEMENTATION NOTES---

* Execution should start with the main() function.

* Google Tasks' data model has no field for time estimates (aka task duration). We
store this in the task.notes field in the form XXmins or YYhours. See regex in 
Helper.parseTimeEstimateString for precise format.

* Google calendar and tasks use date strings in RFC 3339 timestamp. There are functions
in the Helper object for dealing with this format.


Copyright (C) 2014 Ishan Anand

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

//
// Globals
//
var PROPS = {};
var DEFAULT_CALENDAR = CalendarApp.getDefaultCalendar();
var MILLISECONDS_PER_MINUTE = 1000*60;
var MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE*60;

//
// Task-Calendar Synchronization Code
//

function main() {
  PROPS = PropertiesService.getScriptProperties().getProperties();
  processTaskLists();
  PropertiesService.getScriptProperties().setProperties(PROPS,true);
}

// Useful for debugging
function clearProperties() {
  PropertiesService.getScriptProperties().setProperties({},true);
}

// Scan through task lists for tasks to operate on
function processTaskLists() {
  var taskLists = Tasks.Tasklists.list();
  if (taskLists.items) {
    for (var i = 0; i < taskLists.items.length; i++) {
      var taskList = taskLists.items[i];
      processTaskList(taskList.id);
    }
  } else {
    Logger.log('No task lists found.');
  }
}

// Scan through list of tasks for tasks to operate on
function processTaskList(taskListId) {
  var tasks = Tasks.Tasks.list(taskListId);
  if (tasks.items) {
    for (var i = 0; i < tasks.items.length; i++) {
      processTask(tasks.items[i], taskListId);
    }
  } 
}

// Process a single task
function processTask(task, taskListId) {
    if(!task.deleted) {

      // We'll need the taskListId later, save it in the task object.
      task.taskListId = taskListId;
      
      // Check for any task shortcuts.
      processShortcuts(task);
      
      // Sync any incomplete tasks to the calendar.
      if(!task.completed) {
        syncTaskToCalendar(task, taskListId);
      }
    } 
}

// Handle any task shortcuts
function processShortcuts(task) {
  
  // Time estimate shortcut sets a time estimate for the task
  function timeEstimateShortcut() {    
    // Scan title for time estimate
    var result = Helper.parseTimeEstimateString(task.title, {titleFormat:true});
    if(!result) {
      return;
    }
        
    // Remove the estimate shortcut from the title
    task.title = result.newString;

    // Save the estimate in the body
    if(!task.notes) {
      task.notes = "";
    }
    task.notes = result.min + "mins \n" + task.notes;
  }
  
  // Due date shortcut sets a due date for the task
  function dueDateShortcut() {
    // Scan title for due date
    var result = Helper.parseDueDateString(task.title);
    if(!result) {
      return;
    }

    // Apply result to task
    task.title = result.newString;
    task.due = result.dueDate; 
  }
  
  // The done shortcut creates a calendar entry for completed
  // tasks caluculated from the time of completion and estimate
  // duration.
  function doneShortcut() {
    
    if(!task.completed) {
      return;
    }
    var matches = /\:done\b/.exec(task.title);
    if(!matches) {
      return;
    }
    
    // Remove the shortcut from the title
    task.title = task.title.replace(matches[0], "");
    
    // Set today as the due date.
    // task.due = Helper.dateStringfromDate(new Date());
    
    // Get the time estimate for the task
    var timeEstimate = Helper.parseTimeEstimateString(task.notes);
    if(!timeEstimate) {
      return;
    }
    
    // Check if there is a calendar event for this task already
    var eventId = PROPS[task.id];
    if(eventId) {
      // Delete the old event before we create a new one.
      var eventSeries = DEFAULT_CALENDAR.getEventSeriesById(eventId);
      eventSeries.deleteEventSeries();
      PROPS[task.id] = null;
    }
    
    // Create calendar event to record the completed task
    var opts = {};
    opts.endTime = Helper.dateFromDateString(task.completed);
    opts.startTime = new Date(opts.endTime.getTime() - timeEstimate.min*MILLISECONDS_PER_MINUTE); 
    createCalendarEvent(task, timeEstimate.min, opts);
    
  }
  
  // Set the due date for completed tasks that don't have it set. 
  // By setting the due date for completed tasks they will appear
  // in google calendar so we can view what we've done at a glance.
  function completedDueDateShortcut() {
    if(!task.due && task.completed) {
      task.due = task.completed;
    }
  }
  
  // TODO: Tagging functionality
  
  // Handle shorcuts
  dueDateShortcut();
  completedDueDateShortcut();  
  timeEstimateShortcut();    
  
  // Done shortcut reads task.notes for time estimate so it 
  // must execute after time estimate shortcut.
  doneShortcut();
  
  // Save any changes to the task from shortcuts.
  Tasks.Tasks.patch(task, task.taskListId, task.id);
}


function syncTaskToCalendar(task) {
  

  // If there's no due date then don't sync to calendar b/c
  // we don't know what day to schedule the event.
  if(!task.due) {
    return;
  }
  
  // Scan task notes for time estimate.
  // If there's no estimate it's then don't sync to calendar b/c
  // we don't know the event duration.
  var timeEstimate = Helper.parseTimeEstimateString(task.notes);
  if(!timeEstimate) {
    return;
  }

  // Have we created an event for this task already?
  var eventId = PROPS[task.id];

  if(!eventId) {
    createCalendarEvent(task, timeEstimate.min);
  } else {
    updateCalendarEvent(task, timeEstimate.min);
  }
  
  // If we've already sync'd this task to the calendar then verify 
  // that the task was completed
  
  /*
  if(!PROPS[task.id]) {
    var dueDateParts = task.due.split("T")[0].split("-");
    var startTime = new Date(dueDateParts[0], dueDateParts[1]-1, dueDateParts[2],9);
    var endTime = new Date(startTime.getTime() + digits*60*1000);
    var event = CalendarApp.getDefaultCalendar().createEvent("Todo: " + task.title, startTime, endTime);
    Logger.log(event);
    Logger.log(event.getStartTime());
    Logger.log(event.getId());
  }
  */
  
}


// Create an event on the calendar for this task. 
function createCalendarEvent(task,durationInMinutes, opts) {

  // Create event on due date or today (whichever is more recent)
  // TODO consider updating the due date of the task itsef
  // we don't do it yet b/c then user could lose track of overdue tasks
  var dueDate = Helper.normalizedDueDate(task);    
  var today = Helper.normalizedDate(new Date());
  if(today.getTime() > dueDate.getTime()) {
    dueDate = today;
  }
  
  // Create event at 9am on the due date.
  // TODO find first available slot on the calendar
  var startTime = new Date(dueDate.getTime() + 9*MILLISECONDS_PER_HOUR);
  var endTime = new Date(startTime.getTime() + durationInMinutes*MILLISECONDS_PER_MINUTE);  
  
  // Handle optional arguments
  if(opts) {
    startTime = opts.startTime ? opts.startTime : startTime;
    endTime = opts.endTime ? opts.endTime : endTime;
  }
  
  // Create the event
  var event = DEFAULT_CALENDAR.createEvent("GTask: " + task.title, startTime, endTime);  
  
  // Save the event ID for the task
  PROPS[task.id]=event.getId();
  
}

// If an event's task wasn't completed then move it to the current day.
function updateCalendarEvent(task,durationInMinutes) {
  var today = Helper.normalizedDate(new Date());
  var dueDate = Helper.normalizedDueDate(task);
  var isOverdue = today.getTime() >= dueDate.getTime();
  var isIncomplete = !task.completed;
  var eventId = PROPS[task.id];
  var eventSeries = DEFAULT_CALENDAR.getEventSeriesById(eventId);
  
  // Google's API doesn't allow us to directly update the calendar event so 
  // we have to delete and recreate it instead. For more info:
  // https://code.google.com/p/google-apps-script-issues/issues/detail?id=395
  if(eventId && isOverdue && isIncomplete) {
    
    eventSeries.deleteEventSeries();
    PROPS[task.id] = null;
    
    createCalendarEvent(task, durationInMinutes);
  }

}

// Helper functions for string parsing and date conversion.
Helper = {

  // Returns the number of minutes in a time estimate  string
  // Returns 0 if the string does not parse
  // Returns {min: XX, newString: new-string-with-parsed-string-removed}
  parseTimeEstimateString: function parseTimeEstimateString(string, opts) {
  
    // Time estimates can be specified in either the notes or the title
    // of a task and each one has a slightly different format.
    // Assume task.notes format by default.
    var pattern = /^(\d+)(min|mins|hrs|hours|hour)\b/; 
    if(opts && opts.titleFormat) {
      // handle format for estimates in title
      pattern = /\:(\d+)(min|mins|hrs|hours|hour)\b/;
    }
    
    var matches = pattern.exec(string);
    if(!matches) {
      return 0;
    }
    
    // TODO: doesn't parse floats correct like "1.5hours"
    var digits = parseInt(matches[1]);
    var units = matches[2];
  
    // Convert to minutes if the units was hours
    if(units.indexOf("h") != -1) {
      // units is hours
      digits = digits*60;
    }
    
    string = string.replace(matches[0],"");
    
    return {min: digits, newString: string};
  },
  
  

  // Returns the google calendar date string string corresponding to
  // Returns 0 if the string does not parse
  // Returns {dueDate: XX, newString: new-string-with-parsed-string-removed}
  parseDueDateString: function parseDueDateString(string) {

    
    var matchedString = null;
    function isMatch(pattern) {
      var result = pattern.exec(string);
      if(result) {
        matchedString = result[0];
        return 1;
      }
      return 0;
    }
    
    // TODO Handle all days of the week:
    // var pattern = /\:(today|2day|tomorrow|2morrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/i;
    var pattern = /\:(today|2day|tomorrow|2morrow)\b/i;
    
    var matches = pattern.exec(string)
    if(!matches) {
      return 0;
    }
    
    // TODO: parse days of the week
    var dueDate = null;
    var today = new Date();

    
    if(isMatch(/\:(today|2day)\b/)) {
      dueDate = today;
    }
    if(isMatch(/:(tomorrow|2morrow)\b/)) {
      dueDate = new Date(today.getTime() + (24*60*60*1000))
    }
    
    dueDateString = Helper.dateStringfromDate(dueDate);
    string = string.replace(matches[0], "");
    
    return {dueDate: dueDateString, newString: string};  
  },

  // Returns Date object corresponding to google calendar date string
  dateFromDateString: function dateFromDateString(dateString) {    
    var date = new Date(Date.parse(dateString));
    return date;
  },
  
  // Returns google calendar date string for a Date obect
  dateStringfromDate: function dateStringfromDate(d){

    // Convert date object to RFC 3339 timestamp
    // from http://stackoverflow.com/a/7244288/305550
    function pad(n) {
     return n<10 ? '0'+n : n
    }
  
    return d.getUTCFullYear()+'-'
        + pad(d.getUTCMonth()+1)+'-'
        + pad(d.getUTCDate())+'T'
        + pad(d.getUTCHours())+':'
        + pad(d.getUTCMinutes())+':'
        + pad(d.getUTCSeconds())+'Z';  
  },
  
  // Due dates for Tasks are compared on a date basis so we need to "normalize"
  // dates by stripping the time information from them (i.e. setting them
  // to midnight on the specified datetime).

  // Returns a date object representing midnight on the due date of a task. 
  // (see normalize note above)
  normalizedDueDate: function normalizedDueDate(task) {
    var dueDateParts = task.due.split("T")[0].split("-");
    var date = new Date(dueDateParts[0], dueDateParts[1]-1, dueDateParts[2],0);
    return date;
  },
  
  // Converts a date object to midnight of its represented date 
  // (see normalize note above)  
  normalizedDate: function normalizedDate(date) {
    return new Date(date.getYear(), date.getMonth(),date.getDate());
  }

};