#!/usr/bin/env node


const GitHub = require('github'),
  Promise = require('bluebird'),
  stringify = require('csv-stringify'),
  _ = require('lodash'),
  fs = require('fs'),
  dateFormat = require('dateformat'),
  camelcase = require('uppercamelcase');

const github = new GitHub({Promise});

const opts = {
  owner: 'your-organization',
  repo: 'your-repo-name',
  per_page: 100
};

const NUM_OF_COMMENTS = 50;
const NUM_OF_LABELS = 5;

github.authenticate({type: 'oauth', token: 'your-token-here'});

const file = fs.createWriteStream(`${opts.repo}-issues.csv`, {flags: 'w'});
const stringifier = stringify({quotedString: true});
stringifier.pipe(file);

stringifier.write(headers());

github.issues.getForRepo(Object.assign({}, opts, {state: 'all'}))
  .then(paginateWith(handleIssues));

function paginateWith(handler) {
  return res => {
    return handler(res.data)
      .then(() => {
        if (github.hasNextPage(res)) {
          return github.getNextPage(res).then(paginateWith(handler));
        } else {
          return Promise.resolve();
        }
      });
  }
}

function handleIssues(issues) {
  const issuesOnly = issues.filter(issueOnly);
  console.log(`handling ${issuesOnly.length} issues...`);
  return Promise.all(issuesOnly.map(enrichWithComments)).then(writeToFile)
}

function issueOnly(data) {
  return !data['pull_request'];
}

function enrichWithComments(issue) {
  return maybeCommentsForIssue(issue).then(comments => ({issue, comments}));
}

function maybeCommentsForIssue(issue) {
  if (issue.comments > 0) {
    return github.issues.getComments(Object.assign({number: issue['number']}, opts)).then(toStringComments);
  } else {
    return Promise.resolve([]);
  }
}

function headers() {
  const labels = _.range(NUM_OF_LABELS).map(() => 'Label');
  const comments = _.range(NUM_OF_COMMENTS).map(() => 'Comment');
  const base = ['ID', 'Summary', 'Description', 'Date created', 'Date modified', 'Status', 'Reporter', 'Type'];
  return base.concat(labels).concat(comments);
  
}

function writeToFile(issues) {
  issues.forEach(({issue, comments}) => {
    const base = [
      issue['number'],
      issue['title'],
      issue['body'],
      formatDate(issue['created_at']),
      formatDate(issue['updated_at']),
      issue['state'],
      issue['user']['login'],
      'Task'
    ];
    const labels = issue['labels'].map(l => camelcase(l.name));
    labels.unshift('fromGithub');
    padTo(labels, NUM_OF_LABELS);
    const record = base.concat(labels, comments);
    stringifier.write(record);
  });
}

function formatDate(date) {
  return dateFormat(new Date(date), 'dd-mm-yy HH:MM');
}

function padTo(arr, length) {
  for (let i = arr.length; i < length; i++) {
    arr.push('');
  }
}

function toStringComments(res) {
  return res.data.map(c => {
    const time = c.created_at;
    const user = c.user.login;
    const body = c.body.replace('#', '');
    return `Comment: ${user}: ${time}: ${body}`;
  });
}
