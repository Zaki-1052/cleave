import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd

#sns.set_palette(sns.cubehelix_palette())
plt.figure(figsize=(15,15))
#font = {'family' : 'Arial'}
#sns.set(font_scale=1.5, font=font)

df = pd.read_csv("pearson_df_promoter_6.csv")
#print(df.head(5))
#print(len(df.columns))

df_notitle = df.iloc[:,1:]
#print(df_notitle.head(5))

correlation_mat = df_notitle.corr()
print(correlation_mat)

sns.heatmap(correlation_mat, cmap="Blues", annot=True,annot_kws={"size":40},fmt='.2f').get_figure().savefig("corr_promoter_cpgislands_repl2.png")
