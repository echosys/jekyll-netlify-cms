---
title: "What Is git and Why It Is Used For Software Development?"
date: "2020-11-15"
tags: 
  - "git"
  - "source-code"
  - "team-management"
header:
    overlay_image: "/img/posts/pexels-olia-danilevich-4974915.jpg"
---

When software is being worked on by a team of engineers, to increase productivity and decrease dependency, they usually work on different features. That means each developer work on a feature/story and will add/change various files. This can sometimes cause conflicts since multiple developers may need to change the same file. A change conflict is dangerous. It can introduce bugs, break the solution and make it impossible for other developers to continue their changes (dependency), or even worse it may cause you losing some of your precious code and logic.

When multiple objects are racing for the same resource, a common solution in software engineering is to put that resource in the control of a management system and let that system handle the requests. This is the concept behind a _code repository_.

A code repository is a central system that stores the source code in and accepts/rejects change requests from developers.

- It can accept or reject changes from developers
- It can identify conflicting change requests and notify people
- It can accept code changes in a pre-defined format and therefore make it easier to enforce code quality checks
- It can enforce a review before accepting a change
- Since it knows about all the changes, it can give you a detailed history of all changes (who has done what)
- It can even have features to build, test and deploy the software

[Git](https://git-scm.com/) (pronounced as geet (/ɡɪt/)) is a source code management system. It is widely used by small or large teams to handle changes. Before we dive more, you should know that git is different than github. Although they both have been built by the same person and team, [git](https://git-scm.com/) is a software and [github](https://github.com/) is a website.

There are different systems out there. They're usually called Source Control Management (SCM) or Version Control System (VCS) and each has its own way of working. Git has a simple model that I call it _branch-and-merge_. Every repository is created with the main branch which is called "master". A developer creates a branch off master and works on his branch. Each branch is a full copy of the "master" branch. This means you have all the files in the master. In your branch, you can add new files, modify existing files or delete files. Once the developer is finished, he merges his branch back to master. This means all of the changes he made will be transferred to master.

As I said before, These days SCM is used for more than just change conflicts. It checks the quality of changes too before allowing it to be merged. A typical check these days is peer review. Peer Review means the changes made by a developer need to be reviewed by one or more other developers before it is allowed to be merged. SCM allows the merge only when other developers have reviewed and confirmed that these changes are acceptable to be merged. (the definition of acceptable is different in each team and project. They usually negotiate and agree with each other)

When the developer is finished with his changes, he raises a "_Pull Request_". A Pull Request is the way to tell other teammates that his changes are ready to be reviewed and merged.

## Conclusion and Takeaway

It's almost not-practical to build software in a team without using SCM. Without SCM, development steps and increments are not managed properly, change conflicts can happen and cause dependency or code-loss. All this can increase the time and cost of the project and lower the transparency of development progress. Git has a simple branch-and-merge model and it is widely used by small and large software teams across the world. It has other features that help with code quality checks, history and auditing, testing, and deploying the software.
