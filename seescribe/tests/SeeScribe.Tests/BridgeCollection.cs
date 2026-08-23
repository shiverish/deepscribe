using Xunit;

namespace SeeScribe.Tests;

/// <summary>
/// Tests die het pad naar het bridge-bestand via een omgevingsvariabele omleiden,
/// delen procesbrede toestand. Ze horen in één collectie zodat xunit ze niet
/// naast elkaar draait en ze elkaars instelling niet overschrijven.
/// </summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public class BridgeCollection
{
    public const string Name = "DeepScribe bridge";
}
