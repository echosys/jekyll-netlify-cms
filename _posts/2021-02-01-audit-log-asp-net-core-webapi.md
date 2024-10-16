---
title: "How to Audit Your ASP.NET Core WebApi"
date: "2021-02-01"
tags: 
  - "asp-net"
  - "csharp"
  - "dotnet-core"
header:
    overlay_image: "/img/posts/pexels-pixabay-60504.jpg"
---

> If you have an Api that modifies the core data of a system, you need to log every call to that. In addition, If your system accepts input from a 3rd party system, Or sends an output to a 3rd party system, you also need proper logging in case of a dispute happens in the future. In this post, I'm gonna tell you how you can have a proper audit log without re-inventing the wheel!

I picked up a task about audit requirement for one of the core APIs. In the beginning, I put together a small wiki document and called for a meeting to define what we all mean and expect from the word "Audit".

_Firstly_, the data that gets stored needs to be defined. Different people (because of their roles) can expect different details from an audit log. They might have different concerns or need extra pieces of information to make their life easier. Also, certain pieces of Information (a.k.a PII or Personally Identifiable Information) have certain regulations around them. We also discussed whether we want to record request/response headers as well as request/response bodies.

_Secondly_, the storage of logs should be discussed. Where the logs get stored, how much performance hit we can accept, how much cost we can accept, and questions like these.

_Thirdly_, The retention and query of the logs should be discussed. How long they are kept, how we are going to query these data in the future, what format the logs should be written into, does it need to be able to integrate into another system, does it need a human interacting interface, and questions like that.

Next, I started looking into different available options. I came across various libraries, compared them and finally chose [Audit.Net WebApi](https://github.com/thepirat000/Audit.NET/tree/master/src/Audit.WebApi) for the following reasons:

- It is easy and time-efficient to start using it. It can be enabled by controller/action attributes, global action filter, middleware, or a combination of those. This would give us enough flexibility for today and the foreseeable future in case we need to enable/disable it at different levels.

- Multiple storage capabilities: I was amazed when I saw the huge list of [storage providers](https://github.com/thepirat000/Audit.NET#storage-providers). You can store logs locally, on the cloud, in a database, or even create a custom storage provider.

- Structured output: The output is in JSON by default, which means it is easy to query based on its properties later on. No/few string searches would be needed.

- Custom fields can be added to the logs or removed easily. I also looked into the code style needed to add/remove custom fields and whether that matches our team's usual way of writing code.

**Disclaimer: I am not affiliated with [Audit.Net project](https://github.com/thepirat000/Audit.NET) in any way**

## How would an audit log look like?

An output sample would be like this:

```json
{
    "EventType": "POST User.GetUser",
    "Environment": {
        "UserName": "PC1",
        "MachineName": "192-168-1-1",
        "DomainName": "192-168-1-1",
        "CallingMethodName": "ApiProject.Controllers.UserController.GetUser()",
        "AssemblyName": "ApiProject, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null",
        "Culture": ""
    },
    "StartDate": "2021-01-22T02:29:39.130551Z",
    "EndDate": "2021-01-22T02:29:57.809649Z",
    "Duration": 79,
    "Action": {
        "TraceId": "00000001:00000002",
        "HttpMethod": "POST",
        "ControllerName": "User",
        "ActionName": "GetUser",
        "ActionParameters": {
            "userId": 1
        },
        "RequestUrl": "https://localhost:5006/user/1",
        "IpAddress": "::1",
        "ResponseStatus": "OK",
        "ResponseStatusCode": 200,
        "RequestBody": {},
        "Headers": {
            "Connection": "keep-alive",
            "Content-Type": "application/json-patch+json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
            "Cookie": "",
            "Host": "localhost:5006",
            "Referer": "https://localhost:5006/swagger/index.html",
            "User-Agent": "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.96 Safari/537.36",
            "Origin": "https://localhost:5006",
            "Content-Length": "44",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty"
        },
        "ResponseHeaders": {}
    }
}
```

## How to use Audit.Net

### Add Audit.WebApi.Core

```
dotnet add package Audit.WebApi.Core
```

To have a better single responsibility, I created a static class `AuditConfiguration.cs` to contain the logic required for enabling and configuring auditing. I also decided to enable it for all controllers in the project, therefore I went for the global action filter option.

```csharp
public static class AuditConfiguration
{
        // Enables audit log with a global Action Filter
        public static void AddAudit(MvcOptions mvcOptions)
        {    
            mvcOptions.AddAuditFilter(config => config
                .LogAllActions()
                .WithEventType("{verb} {controller}.{action}")
                .IncludeHeaders()
                .IncludeRequestBody()
                .IncludeResponseHeaders()
            );
        }

        // Configures what and how is logged or is not logged
        public static void ConfigureAudit(IServiceCollection serviceCollection)
        {
            // This is explained below
        }
}
```

### Configuring log output

There is a global static _Audit.Core.Configuration_ object which helps you to define all the configurations you need.

There are [many storage providers](https://github.com/thepirat000/Audit.NET#storage-providers), from FileLog to cloud blob storage, cloud databases, and even Apache Kafka. I wanted to have logs simply written out in the console. So I decided to use its _DynamicAsyncDataProvider_ which allows you to define with lambda expressions what needs to be done when a log is outputted.

```csharp
  // Configure audit output
            Audit.Core.Configuration.Setup()
                .UseDynamicAsyncProvider(config => config
                    .OnInsert(async ev => Console.WriteLine(ev.ToJson())));
```

### Add/Remove audit properties

Every log is captured in an AuditScope. AuditScope contains some general info about the event as well as the action object. In order to get the action object, you need to use `GetWebApiAuditAction` extension method.

```csharp
Audit.Core.Configuration.AddCustomAction(ActionType.OnEventSaving, scope =>
{
   var auditAction = scope.Event.GetWebApiAuditAction();
   if (auditAction == null)
   {
      return;
   }

   // Removing sensitive headers
   auditAction.Headers.Remove("Authorization");

   // Adding custom details to the log
   scope.Event.CustomFields.Add("User", new { Name = "UserName", Id = "1234" });

   // Removing request body conditionally as an example
   if (auditAction.HttpMethod.Equals("DELETE"))
   {
      auditAction.RequestBody = null;
   }
});
```

The Scope.Event object gets serialised as JSON with help of Newtonsoft.Json library internally.

### Add to services

Now that you have defined everything, you can simply use these two methods in _Startup.cs_ class. In _ConfigureServices_ method, use it like this:

```csharp
services.AddControllers(configure =>
                {
                    AuditConfiguration.ConfigureAudit(services);
                    AuditConfiguration.AddAudit(configure);
                }
```

That’s it!

Run the api, make a http call and see the full audit log in standard output. Voilà !