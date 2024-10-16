---
title: How I setup .NET Core 3.1 on Mac M1/M2 with JetBrains Rider IDE
tags:
  - net-core
  - dotnet-core
date: '2024-04-23'
---
I recently started working on a project which is using .NET Core 3.1.

As I am the only developer in the team using Mac, and as you may know, .NET Core 3.1 does not support Mac M1/M2 cpus, I faced lots of issues setting up my local environment.

Here is the things I did, hopefully it helps you as well:

## 1\. Make sure Rosetta is installed

Rosetta is an Apple's tool that allows you to run x64 applications on Mac silicon CPUs.

If you need to install it, take a look at this page on Apple website [here](https://support.apple.com/en-au/102527).

## 2\. Install .NET Core 3.1

[Here](https://dotnet.microsoft.com/en-us/download/dotnet/3.1) you can find the latest versions of it, install the version that suits you.

Apple will automatically runs it with Rosetta, whenever it is run.

## 3\. Settings in Jetbrains Rider

There are some settings you need to do, first:

1.  Go to Settings > Build, Execution & Deployment > Tools and Build
    
2.  Select .NET CLI path and MSBuild version to /usr/local/share/dotnet/x64/dotnet (or any other path you installed it), and save it.
    
3.  Open a new terminal
    
4.  open file /etc/paths (probably you need to do it as a root)
    
5.  add this line to it '/usr/local/share/dotnet/x64/dotnet'
    

Save, and restart your IDE.

Now it should be able to open and run it.
