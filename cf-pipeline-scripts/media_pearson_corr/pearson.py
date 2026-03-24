import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd

#sns.set_palette(sns.cubehelix_palette())
plt.figure(figsize=(15,15))
#font = {'family' : 'Arial'}
#sns.set(font_scale=1.5, font=font)

variable = 'AP_ADME_kidney_rep2'

df = pd.read_csv(variable+'.csv')
#print(df.head(5))
#print(len(df.columns))

df_notitle = df.iloc[:,1:]
#print(df_notitle.head(5))

correlation_mat = df_notitle.corr()
print(correlation_mat)

sns.heatmap(correlation_mat, cmap="Blues", annot=True,annot_kws={"size":25},fmt='.2f').get_figure().savefig(variable+'.png')

print("done saving to ", variable +".png")
