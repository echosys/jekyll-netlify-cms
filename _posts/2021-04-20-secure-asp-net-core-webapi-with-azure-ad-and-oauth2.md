---
title: "How to Secure Your ASP.NET Core WebApi with Azure AD and OAuth 2.0"
date: "2021-04-20"
tags: 
  - "net-core"
  - "api"
  - "asp-net"
  - "csharp"
  - "dotnet-core"
  - "rest-api"
  - "web-api"
header:
    overlay_image: "/img/posts/pexels-pixabay-270557.jpg"
---

> Azure AD is a common way of access control these days. OAuth is a well-known protocol that is used and expected from APIs. I found it tricky to integrate my APIs with Azure AD. So I decided to explain it all in very simple terms in this post.

Twenty years ago, when Active Directory was part of [Windows NT](https://en.wikipedia.org/wiki/Windows_NT) and [Windows 2000 Server](https://en.wikipedia.org/wiki/Windows_2000), I was no big fan of it. Nowadays, Active Directory (AD) is a core service offered in Microsoft Azure and it really is a comprehensive access management service. It offers various ways of Authentication, Single Sign-on (SSO), Business to Business authentication (B2B), Business to Customer/Guest Authentication (B2C), Application/API management, Device management and etc. On top of that, it provides conditional access rules and Multi-factor Authentication (MFA).

One of the common industry authentication standards these days is OAuth. OAuth is an open protocol for simple and secure authorization of web, mobile and desktop applications. It's widely used and expected and if any API doesn't have that, I'd say that's a big negative point. As I always say, best practices and standards help us to know how that part of the system works generally and how it's going to behave in different edge cases. No one has the time to study and learn how your API authentication mechanism works and how it's going to behave in different situations.

OAuth offers different authentication paths (which are called as Grant Types). Each Grant Type is designed for a specific situation. For example, client credential grant type is for when an application (such as an API or a mobile App) wants to authenticate itself to another system. If you want to read more about OAuth, I'd suggest to look [here](https://oauth.net/2/).

## How to accept authenticated requests in your API?

Microsoft recommends using [Microsoft.Identity.Web](https://www.nuget.org/packages/Microsoft.Identity.Web) library, and it's a great library. It's super easy to secure controllers with this library and only let in signed-in requests.

In Startup.cs or where you have ConfigureServices method, add this:

using Microsoft.Identity.Web;

public void ConfigureServices(IServiceCollection services)
{
    // Adds Microsoft Identity platform (AAD v2.0) support to protect this Api
    services.AddMicrosoftIdentityWebApiAuthentication(Configuration);

    services.AddControllers();
}

And, in Configure method, add these middlewares to app-builder instance:

app.UseAuthentication();
app.UseAuthorization();

And, finally, in your controllers, you can easily use Authorize custom attribute:

\[Authorize\]
public class TodoListController : Controller
{
   /// controller actions
}

## How to make an authenticated request to an API?

Again, we are using [Microsoft.Identity.Web](https://www.nuget.org/packages/Microsoft.Identity.Web) library. By default, the configuration of this library should be in a_ppsettings.json_:

{
  "AzureAd": {
    "Instance": "https://login.microsoftonline.com/",
    "Domain": "\[Enter the domain of your tenant, e.g. contoso.onmicrosoft.com\]",
    "TenantId": "\[Enter 'common', or 'organizations' or the Tenant Id",
    "ClientId": "\[Enter the Client Id",
    "ClientSecret": "\[Copy the client secret added to the app from the Azure portal\]",
    
    // If using other OAuth authentication paths
    "CallbackPath": "/signin-oidc",
    "SignedOutCallbackPath ": "/signout-callback-oidc",

    // If instead of client\_id and client\_secret, the Api requires a certificate
    "ClientCertificates": "\[or Enter the certificate details\]"
  }
}

Then, in order to obtain an access token, simply inject _ITokenAcquisition_ in the constructor:

using Microsoft.Identity.Web;

private readonly ITokenAcquisition \_tokenAcquisition;

public TodoListService(ITokenAcquisition tokenAcquisition)
{
     \_tokenAcquisition = tokenAcquisition;
}

And, for client credentials flow, simply do:

var accessToken = await \_tokenAcquisition.GetAccessTokenForAppAsync("<Put your scope here>");

Voilà! You have the accessToken. You can assign it now to _Authorization_ header of your HttpClient and make the call.
